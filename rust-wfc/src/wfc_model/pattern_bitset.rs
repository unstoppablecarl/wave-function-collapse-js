use crate::wfc_model::pattern_collection::PatternIndex;

#[derive(Clone)]
pub struct PatternBitSet {
    pub data: Vec<u64>,
    t_count: usize,
}

impl PatternBitSet {
    pub fn new(t_count: usize) -> Self {
        let words = (t_count + 63) / 64;
        let data = vec![0; words];

        Self { data, t_count }
    }

    pub fn set(&mut self, index: PatternIndex) {
        if index.base < self.t_count {
            let word = index.base >> 6;
            let bit = index.base & 63;

            self.data[word] |= 1u64 << bit;
        }
    }
}
