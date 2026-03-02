use crate::wfc_model::cell::CellIndex;
use crate::wfc_model::cell_collection::CellCollection;

#[derive(Clone)]
pub struct SpatialPriority {
    data: CellCollection<f64>,
}

impl SpatialPriority {
    pub fn new(
        width: usize,
        height: usize,
        bias: f64,
        start_x: f64,
        start_y: f64,
    ) -> Self {
        let n_cells = width * height;
        let mut data = CellCollection::new_with_value(n_cells, 0.0);
        let max_x = (width - 1) as f64;
        let max_y = (height - 1) as f64;
        let cx = max_x * start_x;
        let cy = max_y * start_y;

        for i in 0..n_cells {
            let cell_idx = CellIndex { base: i };
            let coords = cell_idx.to_coords(width);
            let x = coords.0 as f64;
            let y = coords.1 as f64;
            let dist_sq = (x - cx).powi(2) + (y - cy).powi(2);

            data[cell_idx] = dist_sq.sqrt() * bias;
        }

        Self { data }
    }

    #[inline(always)]
    pub fn get_bias(&self, cell: CellIndex) -> f64 {
        self.data[cell]
    }
}