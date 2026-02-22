use crate::wfc_model::cell::CellIndex;
use crate::wfc_model::cell_collection::CellCollection;

#[derive(Clone)]
pub struct DirtyCells {
    list: Vec<CellIndex>,
    is_dirty: CellCollection<bool>,
}

impl DirtyCells {
    pub fn new(n_cells: usize) -> Self {
        let list = Vec::with_capacity(n_cells);
        let is_dirty = CellCollection::new_with_value(n_cells, false);

        Self {
            list,
            is_dirty
        }
    }

    pub fn mark_dirty(&mut self, idx: CellIndex) {
        if !self.is_dirty[idx] {
            let buffer = &mut self.list;
            let flags = &mut self.is_dirty;

            buffer.push(idx);
            flags[idx] = true;
        }
    }

    pub fn flush_to_js(&mut self) -> Vec<i32> {
        let raw_list = std::mem::take(&mut self.list);

        let result = raw_list
            .into_iter()
            .map(|idx| {
                self.is_dirty[idx] = false;

                let val = idx.base as i32;

                val
            })
            .collect();

        result
    }

    pub fn peek_changes(&self) -> Vec<i32> {
        let list = &self.list;

        let result = list
            .iter()
            .map(|idx| {
                let val = idx.base as i32;

                val
            })
            .collect();

        result
    }

    pub fn clear(&mut self) {
        let buffer = &mut self.list;
        let flags = &mut self.is_dirty;

        buffer.clear();
        flags.fill(false);
    }

    pub fn mark_all_dirty(&mut self) {
        let n_cells = self.is_dirty.len();

        // Clear the current list to avoid duplicates
        self.list.clear();

        for i in 0..n_cells {
            let idx = CellIndex { base: i };

            // We bypass the mark_dirty check for speed here
            // since we are doing a bulk update.
            self.list.push(idx);
            self.is_dirty[idx] = true;
        }
    }
}