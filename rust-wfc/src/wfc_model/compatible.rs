use crate::wfc_model::cell::CellIndex;
use crate::wfc_model::direction::{Direction, DIRECTIONS};
use crate::wfc_model::pattern::PatternIndex;
use crate::wfc_model::propagator::Propagator;

#[derive(Clone)]
pub struct Compatible {
    data: Vec<u16>,
    t_count: usize,
    cells_per_dir: usize,
}

#[derive(Copy, Clone)]
pub struct CompatibleIndex {
    pub base: usize,
}

impl Compatible {
    pub fn new(n_cells: usize, t_count: usize, propagator: &Propagator) -> Self {
        let mut compatible = Self::new_empty(n_cells, t_count);

        compatible.reset(propagator);
        compatible
    }

    #[inline(always)]
    pub fn new_empty(n_cells: usize, t_count: usize) -> Self {
        let cells_per_dir = n_cells * t_count;
        let data = vec![0u16; cells_per_dir * 4];

        Self {
            data,
            t_count,
            cells_per_dir,
        }
    }

    #[inline(always)]
    pub fn get_index(
        &self,
        cell: CellIndex,
        pattern: PatternIndex,
        direction: Direction,
    ) -> CompatibleIndex {
        // Layout: [All North][All South][All East][All West]
        // This makes the counts for a specific direction contiguous in memory
        let dir_offset = (direction as usize) * self.cells_per_dir;
        let cell_offset = cell.base * self.t_count;
        let base = dir_offset + cell_offset + pattern.base;

        CompatibleIndex { base }
    }

    // pub fn set(
    //     &mut self,
    //     cell: CellIndex,
    //     pattern: PatternIndex,
    //     direction: Direction,
    //     value: u16,
    // ) {
    //     let index = self.get_index(cell, pattern, direction);
    //     self.data[index.base] = value;
    // }

    pub fn decrement_by_index(&mut self, idx: CompatibleIndex) -> u16 {
        let current_val = self.data[idx.base];

        if current_val > 0 {
            self.data[idx.base] -= 1;
        }

        self.data[idx.base]
    }

    #[inline(always)]
    pub fn decrement(
        &mut self,
        cell: CellIndex,
        pattern: PatternIndex,
        direction: Direction,
    ) -> u16 {
        let idx = self.get_index(cell, pattern, direction);

        self.decrement_by_index(idx)
    }

    pub fn reset(&mut self, propagator: &Propagator) {
        let t_count = self.t_count;
        let cells_per_dir = self.cells_per_dir;

        // Linear Memory Lanes: During propagation, you only look at one direction at a time.
        // By grouping by direction first, the CPU cache line (64 bytes) is filled with 32 contiguous u16 counts for the same direction.
        for &d in &DIRECTIONS {
            let mut dir_template = Vec::with_capacity(t_count);

            for t in 0..t_count {
                let p_idx = PatternIndex { base: t };
                let val = propagator.get_compatible_count(p_idx, d) as u16;

                dir_template.push(val);
            }

            // 2. Blast the template into the specific "lane" for this direction
            let dir_start = (d as usize) * cells_per_dir;
            let dir_end = dir_start + cells_per_dir;
            let dir_lane = &mut self.data[dir_start..dir_end];

            // copy_from_slice is much faster than individual 'set' calls
            for cell_chunk in dir_lane.chunks_mut(t_count) {
                cell_chunk.copy_from_slice(&dir_template);
            }
        }
    }
}
