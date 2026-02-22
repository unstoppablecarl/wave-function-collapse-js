#[derive(Copy, Clone)]
pub struct CellIndex {
    pub base: usize,
}

impl CellIndex {
    #[inline(always)]
    pub fn to_coords(&self, width: usize) -> (usize, usize) {
        (self.base % width, self.base / width)
    }
}

pub struct Cell {
    width: usize,
}

impl Cell {
    #[inline(always)]
    pub fn new(width: usize) -> Self {
        Self { width }
    }
    #[inline(always)]
    pub fn get_coords(&self, index: CellIndex) -> (i32, i32) {
        let i = index.base;
        ((i % self.width) as i32, (i / self.width) as i32)
    }

    #[inline(always)]
    pub fn get_index(&self, x: i32, y: i32) -> CellIndex {
        let base = (x as usize) + (y as usize) * self.width;

        CellIndex { base }
    }
}
