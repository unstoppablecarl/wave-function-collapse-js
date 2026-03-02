use std::ops::{Index, IndexMut};

#[derive(Clone)]
pub struct PatternCollection<T> {
    pub data: Vec<T>,
}

impl<T: Clone> PatternCollection<T> {

}

impl<T: Clone + Default> Index<PatternIndex> for PatternCollection<T> {
    type Output = T;

    fn index(&self, index: PatternIndex) -> &Self::Output {
        let pos = index.base;
        let internal_data = &self.data;

        &internal_data[pos]
    }
}

impl<T: Clone + Default> IndexMut<PatternIndex> for PatternCollection<T> {
    #[inline(always)]
    fn index_mut(&mut self, index: PatternIndex) -> &mut Self::Output {
        let pos = index.base;
        let internal_data = &mut self.data;

        &mut internal_data[pos]
    }
}

#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub struct PatternIndex {
   pub base: usize,
}