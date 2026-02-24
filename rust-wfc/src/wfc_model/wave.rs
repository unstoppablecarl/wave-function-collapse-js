use crate::wfc_model::cell::CellIndex;
use crate::wfc_model::entropy_tracker::EntropyTracker;
use crate::wfc_model::pattern::PatternIndex;
use crate::wfc_model::WaveSnapshot;

#[derive(Clone)]
pub struct Wave {
    data: Vec<u64>,
    t_count: usize,
    words_per_cell: usize,
    n_cells: usize,
}

#[derive(Copy, Clone)]
pub struct WaveIndex {
    pub base: usize,
}

impl Wave {
    pub fn new(n_cells: usize, t_count: usize) -> Self {
        let words_per_cell = (t_count + 63) / 64;
        let data = vec![0; n_cells * words_per_cell];

        let mut wave = Self {
            data,
            t_count,
            words_per_cell,
            n_cells,
        };

        wave.fill(1);
        wave
    }

    #[inline(always)]
    pub fn get_index(&self, cell: CellIndex, pattern: PatternIndex) -> WaveIndex {
        let base = (cell.base * self.words_per_cell) + (pattern.base >> 6);
        WaveIndex { base }
    }

    #[inline(always)]
    pub fn is_candidate(&self, cell: CellIndex, pattern: PatternIndex) -> bool {
        if pattern.base >= self.t_count {
            return false;
        }

        let word_idx = self.get_index(cell, pattern).base;
        let bit = pattern.base & 63;

        (self.data[word_idx] & (1u64 << bit)) != 0
    }

    #[inline(always)]
    pub fn eliminate_candidate(&mut self, cell: CellIndex, pattern: PatternIndex) {
        let word_idx = self.get_index(cell, pattern).base;
        let bit = pattern.base & 63;

        self.data[word_idx] &= !(1u64 << bit);
    }

    #[inline(always)]
    pub fn as_ptr(&self) -> *const u64 {
        let ptr = self.data.as_ptr();

        ptr
    }

    pub fn fill(&mut self, value: u8) {
        if value == 0 {
            self.data.fill(0);
            return;
        }

        self.data.fill(u64::MAX);

        let remainder = self.t_count % 64;
        if remainder != 0 {
            let last_word_mask = (1u64 << remainder) - 1;

            for c in 0..self.n_cells {
                let last_word_idx = ((c + 1) * self.words_per_cell) - 1;

                self.data[last_word_idx] &= last_word_mask;
            }
        }
    }

    pub fn clone_data(&self) -> Vec<u64> {
        self.data.clone()
    }

    pub fn set_data(&mut self, s: &WaveSnapshot) {
        self.data.copy_from_slice(&s.wave_data);
    }

    pub fn find_remaining_pattern(&self, i: CellIndex) -> i32 {
        let start = i.base * self.words_per_cell;
        for w in 0..self.words_per_cell {
            let word = self.data[start + w];
            if word != 0 {
                let bit = word.trailing_zeros() as usize;
                let pattern_id = (w << 6) + bit;
                return pattern_id as i32;
            }
        }
        -1
    }

    pub fn get_random_pattern(
        &self,
        cell: CellIndex,
        rng_val: f64,
        entropy_tracker: &EntropyTracker,
    ) -> PatternIndex {
        let mut x = rng_val * entropy_tracker.get_cell_total_weight(cell);
        let start_idx = cell.base * self.words_per_cell;

        for w_idx in 0..self.words_per_cell {
            let mut word = self.data[start_idx + w_idx];
            while word != 0 {
                let bit = word.trailing_zeros() as usize;
                let t_idx = (w_idx << 6) + bit;

                // Safety check for patterns that might exceed t_count in the final word
                if t_idx < self.t_count {
                    let p = PatternIndex { base: t_idx };
                    let weight = entropy_tracker.get_pattern_weight(p);
                    x -= weight;
                    if x <= 0.0 {
                        return p;
                    }
                }
                word &= !(1u64 << bit);
            }
        }

        PatternIndex { base: 0 }
    }

    pub fn collapse_to_pattern<F>(
        &mut self,
        cell: CellIndex,
        chosen_t: PatternIndex,
        mut on_ban: F,
    ) where
        F: FnMut(PatternIndex),
    {
        let word_idx_of_chosen = chosen_t.base >> 6;
        let bit_in_word = chosen_t.base & 63;
        let start_idx = cell.base * self.words_per_cell;

        for w_inner in 0..self.words_per_cell {
            let current_idx = start_idx + w_inner;
            let word = self.data[current_idx];

            if word == 0 {
                continue;
            }

            // Identify all bits that ARE set but SHOULD NOT be (everything except chosen)
            let mut to_ban_mask = word;

            if w_inner == word_idx_of_chosen {
                to_ban_mask &= !(1u64 << bit_in_word);
            }

            while to_ban_mask != 0 {
                let bit = to_ban_mask.trailing_zeros() as usize;
                let t_idx = (w_inner << 6) + bit;

                if t_idx < self.t_count {
                    on_ban(PatternIndex { base: t_idx });
                }

                to_ban_mask &= !(1u64 << bit);
            }
        }
    }

    pub fn is_fully_undetermined(&self, cell: CellIndex, entropy_tracker: &EntropyTracker) -> bool {
        let current_count = entropy_tracker.possible_pattern_count(cell) as usize;

        // If the count matches the total patterns, no bans have occurred here
        current_count == self.t_count
    }
}
