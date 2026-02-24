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
pub struct WFCState {
    pub wave: Wave,
    pub compatible: Compatible,
    pub entropy_tracker: EntropyTracker,
    pub observed: CellCollection<i32>,
    pub dirty_cells: DirtyCells,
    pub stack: Vec<(CellIndex, PatternIndex)>,
}

#[derive(Clone)]
pub struct WaveSnapshot {
    wave_data: Vec<u64>,
    cells_collapsed_indices: Vec<CellIndex>,
    tried_pattern: PatternIndex,
    target_cell: CellIndex,
    last_snapshot_progress: f64,
}

impl WFCState {
    pub fn ban(&mut self, cell_idx: CellIndex, pattern_idx: PatternIndex) {
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
    history: Vec<WaveSnapshot>,
    propagator: Propagator,
    spatial_priority: SpatialPriority,

    state: WFCState,

    generation_complete: bool,
    last_snapshot_progress: f64,
    to_ban_queue: Vec<(CellIndex, PatternIndex)>,

    t_count: usize,
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

        let state = WFCState {
            wave: Wave::new(n_cells, t_count),
            compatible: Compatible::new(n_cells, t_count, &propagator),
            entropy_tracker: EntropyTracker::new(n_cells, t_count, weights),
            observed: CellCollection::new_with_value(n_cells, -1),
            dirty_cells: DirtyCells::new(n_cells),
            stack: Vec::with_capacity(n_cells * t_count),
        };

        Self {
            width,
            height,
            n_cells,
            periodic,
            max_snapshots,
            snapshot_interval_percent,
            cell: Cell::new(width),
            cells_collapsed: CellCollapsedCollection::new(n_cells),
            history: Vec::with_capacity(max_snapshots),
            propagator,
            spatial_priority: SpatialPriority::new(width, height, start_bias, start_x, start_y),
            state,
            t_count,
            generation_complete: false,
            last_snapshot_progress: 0.0,
            to_ban_queue: Vec::with_capacity(1024),
        }
    }

    fn take_snapshot(&mut self, i: CellIndex, t: PatternIndex) {
        if self.max_snapshots == 0 {
            return;
        }
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

        let snapshot = WaveSnapshot {
            wave_data: self.state.wave.clone_data(),
            cells_collapsed_indices: self.cells_collapsed.get_uncollapsed_cells().to_vec(),
            tried_pattern: t,
            target_cell: i,
            last_snapshot_progress: self.last_snapshot_progress,
        };

        self.history.push(snapshot);
        self.last_snapshot_progress = current_progress;
    }

    pub fn propagate(&mut self) -> bool {
        while let Some((cell_idx, pattern_idx)) = self.state.stack.pop() {
            let coords = self.cell.get_coords(cell_idx);
            let (x1, y1) = (coords.0, coords.1);

            for &d in &DIRECTIONS {
                let info = d.info();
                let neighbor_coords = self.wrap_coords(x1 + info.dx, y1 + info.dy);

                if let Some((x2, y2)) = neighbor_coords {
                    let neighbor_cell = self.cell.get_index(x2, y2);
                    let opp_dir = info.opposite;

                    // Grouping references to avoid multiple field lookups
                    let state = &mut self.state;
                    let queue = &mut self.to_ban_queue;

                    self.propagator
                        .for_each_compatible_pattern(pattern_idx, d, |t2| {
                            let new_count = state.compatible.decrement(neighbor_cell, t2, opp_dir);

                            if new_count == 0 && state.wave.is_candidate(neighbor_cell, t2) {
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
        let mut i = 0;
        while i < self.to_ban_queue.len() {
            let (c_idx, p_idx) = self.to_ban_queue[i];

            if self.state.wave.is_candidate(c_idx, p_idx) {
                self.state.ban(c_idx, p_idx);

                if self.state.entropy_tracker.has_no_possible_patterns(c_idx) {
                    self.to_ban_queue.clear();
                    return false;
                }
            }
            i += 1;
        }

        self.to_ban_queue.clear();
        true
    }

    fn collapse_cell(&mut self, cell: CellIndex, chosen_t: PatternIndex) {
        // We use a local buffer to avoid the borrow checker "Boss"
        let mut local_to_ban = Vec::with_capacity(64);

        // 1. Ask the state's wave which patterns must go
        self.state
            .wave
            .collapse_to_pattern(cell, chosen_t, |p_idx| {
                local_to_ban.push(p_idx);
            });

        // 2. Tell the state to ban them one by one
        for p_idx in local_to_ban {
            self.state.ban(cell, p_idx);
        }
    }

    pub fn revert(&mut self) -> bool {
        if let Some(s) = self.history.pop() {
            // 1. Restore Wave
            self.state.wave.set_data(&s);

            // 2. Reset counts and Entropy
            self.state.compatible.reset(&self.propagator);
            self.state.entropy_tracker.reset();
            self.state.observed.fill(-1);

            // 3. The "Heavy Lifter": Rebuild state from the Wave
            self.rebuild_state_from_wave();

            // 4. Restore the uncollapsed cell list
            self.cells_collapsed.reset_from_snapshot(&s.cells_collapsed_indices);

            // 5. Cleanup and re-apply the triggering ban
            self.to_ban_queue.clear();
            self.state.stack.clear();
            self.last_snapshot_progress = s.last_snapshot_progress;
            self.state.dirty_cells.mark_all_dirty();

            self.state.ban(s.target_cell, s.tried_pattern);

            return true;
        }

        false
    }

    fn rebuild_state_from_wave(&mut self) {
        let n_cells = self.n_cells;
        let t_count = self.t_count;

        for i in 0..n_cells {
            let cell_idx = CellIndex { base: i };

            // We only need to propagate cells that have had patterns removed
            if self.state.wave.is_fully_undetermined(cell_idx, &self.state.entropy_tracker) {
                continue;
            }

            for t in 0..t_count {
                let pattern_idx = PatternIndex { base: t };
                if !self.state.wave.is_candidate(cell_idx, pattern_idx) {
                    // If the pattern is banned in the wave,
                    // update the neighbor counts
                    self.manually_propagate_ban(cell_idx, pattern_idx);
                    self.state.entropy_tracker.ban_pattern(cell_idx, pattern_idx);
                }
            }

            if self.state.entropy_tracker.pattern_determined(cell_idx) {
                let p = self.state.wave.find_remaining_pattern(cell_idx);
                self.state.observed[cell_idx] = p;
            }
        }
    }

    fn manually_propagate_ban(&mut self, cell_idx: CellIndex, pattern_idx: PatternIndex) {
        let coords = self.cell.get_coords(cell_idx);
        let (x1, y1) = (coords.0, coords.1);

        for &d in &DIRECTIONS {
            let info = d.info();
            let neighbor_coords = self.wrap_coords(x1 + info.dx, y1 + info.dy);

            if let Some((x2, y2)) = neighbor_coords {
                let neighbor_cell = self.cell.get_index(x2, y2);
                let opp_dir = info.opposite;

                let propagator = &self.propagator;
                let compatible = &mut self.state.compatible;

                // Update neighbor counts for all patterns supported by the banned pattern
                propagator.for_each_compatible_pattern(pattern_idx, d, |t2| {
                    compatible.decrement(neighbor_cell, t2, opp_dir);
                });
            }
        }
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

    pub fn single_iteration_with_snapshots(&mut self, rng_val: f64) -> IterationResult {
        let target = self.find_observe_target(rng_val);

        match target {
            None => {
                self.generation_complete = true;
                IterationResult::SUCCESS
            }
            Some(i) => {
                if self.state.entropy_tracker.has_no_possible_patterns(i) {
                    return if self.revert() {
                        IterationResult::REVERT
                    } else {
                        IterationResult::FAIL
                    };
                }

                let chosen_t =
                    self.state
                        .wave
                        .get_random_pattern(i, rng_val, &self.state.entropy_tracker);

                self.take_snapshot(i, chosen_t);
                self.collapse_cell(i, chosen_t);

                if self.propagate() {
                    self.cells_collapsed.refresh(&self.state.entropy_tracker);
                    IterationResult::STEP
                } else if self.revert() {
                    IterationResult::REVERT
                } else {
                    IterationResult::FAIL
                }
            }
        }
    }

    fn find_observe_target(&self, rng_val: f64) -> Option<CellIndex> {
        let mut min_score = f64::MAX;
        let mut min_idx = None;
        let noise_scale = 1e-6;

        for &idx in self.cells_collapsed.get_uncollapsed_cells() {
            let entropy = self.state.entropy_tracker.get_cell_entropy(idx);
            let score = entropy + self.spatial_priority.get_bias(idx) + (noise_scale * rng_val);

            if score < min_score {
                min_score = score;
                min_idx = Some(idx);
            }
        }
        min_idx
    }

    pub fn wave_ptr(&self) -> *const u64 {
        self.state.wave.as_ptr()
    }
    pub fn observed_ptr(&self) -> *const i32 {
        self.state.observed.data.as_ptr()
    }
    pub fn entropies_ptr(&self) -> *const f64 {
        self.state.entropy_tracker.entropies_ptr()
    }

    pub fn clear(&mut self) {
        self.generation_complete = false;
        self.state.wave.fill(1);
        self.state.observed.fill(-1);
        self.history.clear();
        self.cells_collapsed.reset(self.n_cells);
        self.state.dirty_cells.clear();
        self.state.compatible.reset(&self.propagator);
        self.state.entropy_tracker.reset();
        self.state.stack.clear();
    }

    pub fn filled_percent(&self) -> f64 {
        (self.cells_collapsed.collapsed_count() as f64) / (self.n_cells as f64)
    }

    pub fn get_changes(&mut self) -> Vec<i32> {
        self.state.dirty_cells.flush_to_js()
    }

    pub fn is_generation_complete(&self) -> bool {
        self.generation_complete
    }

    pub fn get_filled_count(&self) -> usize {
        self.cells_collapsed.collapsed_count()
    }

    pub fn get_total_cells(&self) -> usize {
        self.n_cells
    }

    pub fn get_total_memory_usage_bytes(&self) -> usize {
        let pages = core::arch::wasm32::memory_size(0);
        let bytes = pages * 65536;

        bytes
    }
}
