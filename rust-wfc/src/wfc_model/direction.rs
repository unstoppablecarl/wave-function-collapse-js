#[derive(Copy, Clone, PartialEq, Eq)]
pub enum Direction {
    West = 0,
    South = 1,
    East = 2,
    North = 3,
}

pub const DIRECTIONS: [Direction; 4] = [
    Direction::West,
    Direction::South,
    Direction::East,
    Direction::North,
];

pub struct DirectionInfo {
    pub dx: i32,
    pub dy: i32,
    pub opposite: Direction,
}

impl Direction {
    pub fn info(self) -> DirectionInfo {
        match self {
            Direction::West => DirectionInfo {
                dx: -1,
                dy: 0,
                opposite: Direction::East,
            },
            Direction::South => DirectionInfo {
                dx: 0,
                dy: 1,
                opposite: Direction::North,
            },
            Direction::East => DirectionInfo {
                dx: 1,
                dy: 0,
                opposite: Direction::West,
            },
            Direction::North => DirectionInfo {
                dx: 0,
                dy: -1,
                opposite: Direction::South,
            },
        }
    }
}
