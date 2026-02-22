use crate::wfc_model::cell::CellIndex;
use crate::wfc_model::entropy_tracker::EntropyTracker;

#[derive(Clone)]
pub struct CellCollapsedCollection {
    pub indices: Vec<CellIndex>,
    pub count: usize,
    n_cells: usize,
}

impl CellCollapsedCollection {
    pub fn new(n_cells: usize) -> Self {
        let indices = (0..n_cells)
            .map(|n| {
                let idx = CellIndex { base: n };

                idx
            })
            .collect();

        Self {
            indices,
            n_cells,
            count: n_cells,
        }
    }

    pub fn get_uncollapsed_cells(&self) -> &[CellIndex] {
        let active_slice = &self.indices[..self.count];

        active_slice
    }

    pub fn reset(&mut self, n_cells: usize) {
        self.count = n_cells;

        for i in 0..n_cells {
            let idx = CellIndex { base: i };

            self.indices[i] = idx;
        }
    }

    pub fn refresh(&mut self, entropy_tracker: &EntropyTracker) {
        let mut j = 0;
        let current_count = self.count;

        for i in 0..current_count {
            let idx = self.indices[i];
            let pattern_count = entropy_tracker.possible_pattern_count(idx);

            if pattern_count > 1 {
                self.indices[j] = idx;
                j += 1;
            }
        }

        self.count = j;
    }

    pub fn collapsed_count(&self) -> usize {
        // The number of collapsed cells is simply Total - Uncollapsed
        let collapsed = self.n_cells - self.count;

        collapsed
    }
}
