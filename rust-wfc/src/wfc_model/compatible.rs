use crate::wfc_model::cell::CellIndex;
use crate::wfc_model::direction::{Direction, DIRECTIONS};
use crate::wfc_model::pattern::PatternIndex;
use crate::wfc_model::propagator::Propagator;

const STRIDE: usize = 4;
#[derive(Clone)]
pub struct Compatible {
    data: Vec<i32>,
    t_count: usize,
    n_cells: usize,
}

#[derive(Copy, Clone)]
pub struct CompatibleIndex {
    pub base: usize,
}

impl Compatible {
    pub fn new(n_cells: usize, t_count: usize, propagator: &Propagator) -> Self {
        // Initialize with default zeroed data first
        let mut compatible = Self::new_empty(n_cells, t_count);

        for i in 0..n_cells {
            let cell_idx = CellIndex { base: i };

            for t in 0..t_count {
                let pattern_idx = PatternIndex { base: t };

                for d in DIRECTIONS {
                    let val = propagator.get_compatible_count(pattern_idx, d);

                    compatible.set(cell_idx, pattern_idx, d, val);
                }
            }
        }
        compatible
    }

    #[inline(always)]
    pub fn new_empty(n_cells: usize, t_count: usize) -> Self {
        let size = n_cells * t_count * STRIDE;
        let data = vec![0; size];

        Self {
            data,
            t_count,
            n_cells,
        }
    }

    #[inline(always)]
    pub fn get_index(
        &self,
        cell: CellIndex,
        pattern: PatternIndex,
        direction: Direction,
    ) -> CompatibleIndex {
        let base = (cell.base * self.t_count + pattern.base) * STRIDE + direction as usize;

        CompatibleIndex { base }
    }

    pub fn set(
        &mut self,
        cell: CellIndex,
        pattern: PatternIndex,
        direction: Direction,
        value: i32,
    ) {
        let index = self.get_index(cell, pattern, direction);
        self.data[index.base] = value;
    }

    pub fn decrement_by_index(&mut self, idx: CompatibleIndex) -> i32 {
        let current_val = self.data[idx.base];

        if current_val > 0 {
            self.data[idx.base] -= 1;
        }

        self.data[idx.base]
    }

    pub fn decrement(
        &mut self,
        cell: CellIndex,
        pattern: PatternIndex,
        direction: Direction,
    ) -> i32 {
        let idx = self.get_index(cell, pattern, direction);

        self.decrement_by_index(idx)
    }

    pub fn reset(&mut self, propagator: &Propagator) {
        for i in 0..self.n_cells {
            let cell_idx = CellIndex { base: i };

            for t in 0..self.t_count {
                let pattern_idx = PatternIndex { base: t };

                for &d in &DIRECTIONS {
                    // Get the count of valid neighbors from the propagator
                    let val = propagator.get_compatible_count(pattern_idx, d);

                    self.set(cell_idx, pattern_idx, d, val);
                }
            }
        }
    }
}
