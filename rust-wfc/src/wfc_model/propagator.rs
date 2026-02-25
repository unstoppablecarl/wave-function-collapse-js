use crate::wfc_model::direction::Direction;
use crate::wfc_model::pattern_collection::PatternIndex;
use crate::wfc_model::pattern_bitset::PatternBitSet;

#[derive(Clone)]
pub struct Propagator {
    lengths: Vec<i32>,
    t_count: usize,
    // Pre-calculated masks for bitwise propagation
    masks: Vec<PatternBitSet>,
}
impl Propagator {
    pub fn new(data: Vec<i32>, offsets: Vec<i32>, lengths: Vec<i32>, t_count: usize) -> Self {
        let mut masks = Vec::with_capacity(t_count * 4);

        for d_idx in 0..4 {
            for t_idx in 0..t_count {
                let mut bitset = PatternBitSet::new(t_count);
                let lookup_idx = (d_idx * t_count) + t_idx;
                let start = offsets[lookup_idx] as usize;
                let len = lengths[lookup_idx] as usize;
                let end = start + len;
                let valid_ids = &data[start..end];

                for &id in valid_ids {

                    let pattern_idx = PatternIndex{ base: id as usize };

                    bitset.set(pattern_idx);
                }

                masks.push(bitset);
            }
        }

        Self {
            lengths,
            t_count,
            masks,
        }
    }

    #[inline(always)]
    pub fn get_lookup_idx(&self, pattern: PatternIndex, direction: Direction) -> usize {
        let d_val = direction as usize;
        let result = d_val * self.t_count + pattern.base;

        result
    }

    pub fn get_mask(&self, pattern: PatternIndex, direction: Direction) -> &PatternBitSet {
        let idx = self.get_lookup_idx(pattern, direction);
        let mask = &self.masks[idx];

        mask
    }

    pub fn get_compatible_count(&self, pattern: PatternIndex, direction: Direction) -> i32 {
        let idx = self.get_lookup_idx(pattern, direction);
        let count = self.lengths[idx];

        count
    }

    pub fn for_each_compatible_pattern<F>(
        &self,
        pattern: PatternIndex,
        direction: Direction,
        mut f: F,
    ) where
        F: FnMut(PatternIndex),
    {
        let mask = self.get_mask(pattern, direction);

        for (w_idx, &bits) in mask.data.iter().enumerate() {
            let mut bits_to_check = bits;

            while bits_to_check != 0 {
                let bit = bits_to_check.trailing_zeros() as usize;
                let t_idx = (w_idx << 6) + bit;

                if t_idx < self.t_count {
                    f(PatternIndex { base: t_idx });
                }

                bits_to_check &= bits_to_check - 1;
            }
        }
    }
}
