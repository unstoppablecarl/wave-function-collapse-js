use crate::wfc_model::cell::Cell;
use crate::wfc_model::cell::CellIndex;
use crate::wfc_model::cell_collapsed_collection::CellCollapsedCollection;
use crate::wfc_model::cell_collection::CellCollection;
use crate::wfc_model::compatible::Compatible;
use crate::wfc_model::direction::DIRECTIONS;
use crate::wfc_model::dirty_cells::DirtyCells;
use crate::wfc_model::entropy_tracker::EntropyTracker;
use crate::wfc_model::pattern::PatternIndex;
use crate::wfc_model::propagator::Propagator;
use crate::wfc_model::spatial_priority::SpatialPriority;
use crate::wfc_model::wave::Wave;
use std::f64;
use wasm_bindgen::prelude::*;

mod cell;
mod cell_collapsed_collection;
mod cell_collection;
mod compatible;
mod direction;
mod dirty_cells;
mod entropy_tracker;
mod pattern;
mod pattern_bitset;
mod pattern_collection;
mod propagator;
mod spatial_priority;
mod wave;

#[wasm_bindgen]
#[derive(Clone, Copy, PartialEq)]
pub enum IterationResult {
    REVERT,
    SUCCESS,
    STEP,
    FAIL,
}

#[derive(Clone)]
pub struct WFCSnapshot {
    wave: Wave,
    compatible: Compatible,
    entropy_tracker: EntropyTracker,
    observed: CellCollection<i32>,
    cells_collapsed: CellCollapsedCollection,
    // Patterns already attempted at this level
    tried_pattern: PatternIndex,
    // Which cell we were trying to collapse
    target_cell: CellIndex,
}

#[wasm_bindgen]
pub struct WFCModel {
    width: usize,
    height: usize,
    n_cells: usize,
    periodic: bool,
    max_snapshots: usize,
    snapshot_interval_percent: f64,

    cell: Cell,
    cells_collapsed: CellCollapsedCollection,
    compatible: Compatible,
    entropy_tracker: EntropyTracker,
    history: Vec<WFCSnapshot>,
    observed: CellCollection<i32>,
    propagator: Propagator,
    spatial_priority: SpatialPriority,
    wave: Wave,

    // for external drawing
    dirty_cells: DirtyCells,

    // lifecycle state
    generation_complete: bool,
    last_snapshot_progress: f64,
    stack: Vec<(CellIndex, PatternIndex)>,
    to_ban_queue: Vec<(CellIndex, PatternIndex)>,
}

#[wasm_bindgen]
impl WFCModel {
    #[wasm_bindgen(constructor)]
    pub fn new(
        width: usize,
        height: usize,
        t_count: usize,
        weights: Vec<f64>,
        prop_data: Vec<i32>,
        prop_offsets: Vec<i32>,
        prop_lengths: Vec<i32>,
        periodic: bool,
        start_bias: f64,
        start_x: f64,
        start_y: f64,
        max_snapshots: usize,
        snapshot_interval_percent: f64,
    ) -> Self {
        let n_cells = width * height;
        let propagator = Propagator::new(prop_data, prop_offsets, prop_lengths, t_count);

        let model = Self {
            width,
            height,
            n_cells,
            periodic,
            max_snapshots,
            snapshot_interval_percent,

            cell: Cell::new(width),
            cells_collapsed: CellCollapsedCollection::new(n_cells),
            compatible: Compatible::new(n_cells, t_count, &propagator),
            entropy_tracker: EntropyTracker::new(n_cells, t_count, weights),
            history: Vec::with_capacity(max_snapshots),
            observed: CellCollection::new_with_value(n_cells, -1),
            propagator,
            wave: Wave::new(n_cells, t_count),
            spatial_priority: SpatialPriority::new(width, height, start_bias, start_x, start_y),

            dirty_cells: DirtyCells::new(n_cells),

            generation_complete: false,
            last_snapshot_progress: 0.0,
            stack: Vec::<(CellIndex, PatternIndex)>::with_capacity(n_cells * t_count),
            to_ban_queue: Vec::<(CellIndex, PatternIndex)>::with_capacity(16),
        };

        model
    }

    #[inline(always)]
    fn wrap_coords(&self, x: i32, y: i32) -> Option<(i32, i32)> {
        let (mut nx, mut ny) = (x, y);
        let (w, h) = (self.width as i32, self.height as i32);

        if self.periodic {
            nx = (nx % w + w) % w;
            ny = (ny % h + h) % h;
            Some((nx, ny))
        } else if nx >= 0 && ny >= 0 && nx < w && ny < h {
            Some((nx, ny))
        } else {
            None
        }
    }

    fn take_snapshot(&mut self, i: CellIndex, t: PatternIndex) {
        let current_progress = self.filled_percent();
        let diff = current_progress - self.last_snapshot_progress;

        // Only take a snapshot if we've moved past the interval threshold
        if diff < self.snapshot_interval_percent && !self.history.is_empty() {
            return;
        }

        // Maintain the maximum history limit to preserve memory
        if self.history.len() >= self.max_snapshots {
            self.history.remove(0);
        }

        let snapshot = WFCSnapshot {
            wave: self.wave.clone(),
            compatible: self.compatible.clone(),
            entropy_tracker: self.entropy_tracker.clone(),
            observed: self.observed.clone(),
            cells_collapsed: self.cells_collapsed.clone(),
            tried_pattern: t,
            target_cell: i,
        };
        self.history.push(snapshot);
        self.last_snapshot_progress = current_progress;
    }

    fn ban(&mut self, cell_idx: CellIndex, pattern_idx: PatternIndex) {
        if !self.wave.is_candidate(cell_idx, pattern_idx) {
            return;
        }

        self.wave.eliminate_candidate(cell_idx, pattern_idx);
        self.dirty_cells.mark_dirty(cell_idx);
        self.entropy_tracker.ban_pattern(cell_idx, pattern_idx);

        if self.entropy_tracker.pattern_determined(cell_idx) {
            let remaining = self.wave.find_remaining_pattern(cell_idx);
            self.observed[cell_idx] = remaining;
        }

        self.stack.push((cell_idx, pattern_idx));
    }

    pub fn propagate(&mut self) -> bool {
        while let Some((cell_idx, pattern_idx)) = self.stack.pop() {
            let coords = self.cell.get_coords(cell_idx);
            let x1 = coords.0;
            let y1 = coords.1;

            for &d in &DIRECTIONS {
                let info = d.info();
                let nx = x1 + info.dx;
                let ny = y1 + info.dy;
                let neighbor_coords = self.wrap_coords(nx, ny);

                if let Some((x2, y2)) = neighbor_coords {
                    let neighbor_cell = self.cell.get_index(x2, y2);
                    let opp_dir = info.opposite;

                    let comp = &mut self.compatible;
                    let wave = &self.wave;
                    let queue = &mut self.to_ban_queue;

                    self.propagator
                        .for_each_compatible_pattern(pattern_idx, d, |t2| {
                            let new_count = comp.decrement(neighbor_cell, t2, opp_dir);

                            if new_count == 0 && wave.is_candidate(neighbor_cell, t2) {
                                queue.push((neighbor_cell, t2));
                            }
                        });
                }
            }

            if !self.process_ban_queue() {
                return false;
            }
        }
        true
    }

    fn process_ban_queue(&mut self) -> bool {
        if self.to_ban_queue.is_empty() {
            return true;
        }

        let mut current_bans = std::mem::take(&mut self.to_ban_queue);

        for &(c_idx, p_idx) in &current_bans {
            if self.wave.is_candidate(c_idx, p_idx) {
                self.ban(c_idx, p_idx);

                if self.entropy_tracker.has_no_possible_patterns(c_idx) {
                    current_bans.clear();
                    self.to_ban_queue = current_bans;

                    return false;
                }
            }
        }

        current_bans.clear();
        self.to_ban_queue = current_bans;

        true
    }

    pub fn single_iteration(&mut self, rng_val: f64) -> IterationResult {
        let target = self.find_observe_target(rng_val);
        match target {
            None => {
                self.generation_complete = true;
                IterationResult::SUCCESS
            }
            Some(i) if self.entropy_tracker.has_no_possible_patterns(i) => IterationResult::REVERT,
            Some(i) => {
                let chosen_t = self.get_random_pattern(i, rng_val);
                self.collapse_cell(i, chosen_t);

                if self.propagate() {
                    self.cells_collapsed.refresh(&self.entropy_tracker);
                    IterationResult::STEP
                } else {
                    IterationResult::REVERT
                }
            }
        }
    }

    fn find_observe_target(&self, rng_val: f64) -> Option<CellIndex> {
        let mut min_score = f64::MAX;
        let mut min_idx = None;
        let noise_scale = 1e-6;

        for &idx in self.cells_collapsed.get_uncollapsed_cells() {
            let entropy = self.entropy_tracker.get_cell_entropy(idx);
            let noise = noise_scale * rng_val;
            let score = entropy + self.spatial_priority.get_bias(idx) + noise;

            if score < min_score {
                min_score = score;
                min_idx = Some(idx);
            }
        }

        min_idx
    }

    fn get_random_pattern(&self, i: CellIndex, rng_val: f64) -> PatternIndex {
        self.wave
            .get_random_pattern(i, rng_val, &self.entropy_tracker)
    }

    pub fn wave_ptr(&self) -> *const u64 {
        self.wave.as_ptr()
    }

    pub fn observed_ptr(&self) -> *const i32 {
        let ptr = self.observed.data.as_ptr();

        ptr
    }

    pub fn entropies_ptr(&self) -> *const f64 {
        self.entropy_tracker.entropies_ptr()
    }

    pub fn clear(&mut self) {
        self.generation_complete = false;
        self.wave.fill(1);
        self.observed.fill(-1);
        self.history.clear();
        self.cells_collapsed.reset(self.n_cells);
        self.dirty_cells.clear();
        self.compatible.reset(&self.propagator);
        self.entropy_tracker.reset();
    }

    pub fn get_filled_count(&self) -> usize {
        self.cells_collapsed.collapsed_count()
    }

    pub fn filled_percent(&self) -> f64 {
        let filled = self.get_filled_count() as f64;
        let total = self.n_cells;

        filled / (total as f64)
    }

    pub fn single_iteration_with_snapshots(&mut self, rng_val: f64) -> IterationResult {
        let target = self.find_observe_target(rng_val);

        match target {
            None => {
                self.generation_complete = true;
                IterationResult::SUCCESS
            }
            Some(i) => {
                // If we found a cell with 0 patterns, we must revert
                if self.entropy_tracker.has_no_possible_patterns(i) {
                    return if self.revert() {
                        IterationResult::REVERT
                    } else {
                        IterationResult::FAIL
                    };
                }

                let chosen_t = self.get_random_pattern(i, rng_val);

                self.take_snapshot(i, chosen_t);
                self.collapse_cell(i, chosen_t);

                if self.propagate() {
                    self.cells_collapsed.refresh(&self.entropy_tracker);
                    IterationResult::STEP
                } else {
                    // Contradiction during propagation: Roll back!
                    if self.revert() {
                        IterationResult::REVERT
                    } else {
                        IterationResult::FAIL
                    }
                }
            }
        }
    }

    fn collapse_cell(&mut self, cell: CellIndex, chosen_t: PatternIndex) {
        let to_ban = self.wave.collapse_to_pattern(cell, chosen_t);

        for pattern_idx in to_ban {
            self.ban(cell, pattern_idx);
        }
    }

    pub fn revert(&mut self) -> bool {
        let snapshot = self.history.pop();

        if let Some(s) = snapshot {
            self.wave = s.wave;
            self.compatible = s.compatible;
            self.entropy_tracker = s.entropy_tracker;
            self.observed = s.observed;
            self.cells_collapsed = s.cells_collapsed;

            self.stack.clear();
            self.to_ban_queue.clear();

            self.last_snapshot_progress = self.filled_percent();
            self.dirty_cells.mark_all_dirty();

            // Ban the specific pattern that led to the contradiction
            self.ban(s.target_cell, s.tried_pattern);

            return true;
        }

        false
    }

    pub fn is_generation_complete(&self) -> bool {
        self.generation_complete
    }

    pub fn get_total_cells(&self) -> usize {
        self.n_cells
    }

    pub fn get_changes(&mut self) -> Vec<i32> {
        self.dirty_cells.flush_to_js()
    }

    pub fn peek_changes(&mut self) -> Vec<i32> {
        self.dirty_cells.peek_changes()
    }
}
