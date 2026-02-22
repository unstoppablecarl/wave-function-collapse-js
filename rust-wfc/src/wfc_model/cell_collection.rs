use crate::wfc_model::cell::CellIndex;
use std::ops::{Index, IndexMut};

#[derive(Clone)]
pub struct CellCollection<T> {
    pub data: Vec<T>,
}

impl<T: Clone + Default> CellCollection<T> {

    pub fn new_with_value(n_cells: usize, value: T) -> Self {
        let data = vec![value; n_cells];

        Self { data }
    }

    pub fn len(&self) -> usize {
        let length = self.data.len();

        length
    }

    pub fn as_ptr(&self) -> *const T {
        let ptr = self.data.as_ptr();

        ptr
    }
    
    pub fn fill(&mut self, value: T) {
        self.data.fill(value);
    }
}

impl<T: Clone + Default> Index<CellIndex> for CellCollection<T> {
    type Output = T;

    #[inline(always)]
    fn index(&self, index: CellIndex) -> &Self::Output {
        let pos = index.base;
        let internal_data = &self.data;

        &internal_data[pos]
    }
}

impl<T: Clone + Default> IndexMut<CellIndex> for CellCollection<T> {
    #[inline(always)]
    fn index_mut(&mut self, index: CellIndex) -> &mut Self::Output {
        let pos = index.base;
        let internal_data = &mut self.data;

        &mut internal_data[pos]
    }
}
