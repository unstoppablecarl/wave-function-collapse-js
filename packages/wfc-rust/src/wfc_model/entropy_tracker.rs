use crate::wfc_model::cell::CellIndex;
use crate::wfc_model::cell_collection::CellCollection;
use crate::wfc_model::pattern_collection::PatternIndex;
use crate::wfc_model::pattern_collection::PatternCollection;

#[derive(Clone)]
pub struct EntropyTracker {

    // The number of remaining possible patterns for each cell.
    // When this reaches 1, the cell is "collapsed." When 0, it's a "contradiction."
    possible_pattern_count: CellCollection<i32>,

    // The statistical weights sum of all currently possible patterns in a cell.
    // Used for calculating entropy and weighted random selection.
    // This value decreases as patterns are banned, shrinking the probability pool for this cell.
    // It serves as the divisor to normalize individual pattern weights into a 0.0-1.0 range.
    weights: CellCollection<f64>,

    // The running sum of (w * ln(w)) for all currently possible patterns in a cell.
    // This is the "inner term" of the Shannon Entropy formula.
    // Storing this allows us to update entropy in O(1) time during a ban by simple subtraction,
    // rather than re-scanning all patterns in O(T) time.
    log_weights: CellCollection<f64>,

    // The current Shannon Entropy (complexity/chaos) of the cell.
    // Cells with the lowest entropy (fewest remaining valid choices) are prioritized to be collapsed next.
    // A cell with an entropy of 0 is either fully collapsed (1 choice) or in a contradiction (0 choices).
    // Adding a tiny amount of random noise to these values during selection helps break ties and prevents "tiling" artifacts.
    // This array is the primary "map" the Observer uses to decide where the next collapse should occur.
    entropies: CellCollection<f64>,

    // The immutable base weights for every pattern defined in the input data.
    // These are used as a reference to subtract from the cell's 'weights' sum during a ban.
    // High-weight patterns appear more frequently in the final output.
    pattern_weights: PatternCollection<f64>,

    // The pre-calculated values of (weight * ln(weight)) for every pattern.
    // These are calculated once at initialization to avoid expensive natural log calls
    // during the high-frequency propagation and banning loops.
    pattern_log_weights: PatternCollection<f64>,
    t_count: usize,
    init_sum: f64,
    init_log_sum: f64,
    init_entropy: f64,
}

impl EntropyTracker {
    pub fn new(n_cells: usize, t_count: usize, weights: Vec<f64>) -> Self {
        let initial_sum: f64 = weights.iter().sum();

        let log_weight_data: Vec<f64> = weights
            .iter()
            .map(|&w| if w > 0.0 { w * w.ln() } else { 0.0 })
            .collect();

        let initial_log_sum: f64 = log_weight_data.iter().sum();

        let initial_entropy = if initial_sum > 0.0 {
            initial_sum.ln() - (initial_log_sum / initial_sum)
        } else {
            0.0
        };

        Self {
            possible_pattern_count: CellCollection::new_with_value(n_cells, t_count as i32),
            weights: CellCollection::new_with_value(n_cells, initial_sum),
            log_weights: CellCollection::new_with_value(n_cells, initial_log_sum),
            entropies: CellCollection::new_with_value(n_cells, initial_entropy),
            pattern_weights: PatternCollection { data: weights },
            pattern_log_weights: PatternCollection {
                data: log_weight_data,
            },
            t_count,
            init_sum: initial_sum,
            init_log_sum: initial_log_sum,
            init_entropy: initial_entropy,
        }
    }

    pub fn ban_pattern(&mut self, cell: CellIndex, pattern: PatternIndex) {
        self.possible_pattern_count[cell] -= 1;

        let w = self.pattern_weights[pattern];
        let lw = self.pattern_log_weights[pattern];

        let new_sum = (self.weights[cell] - w).max(0.0);
        let new_log_sum = self.log_weights[cell] - lw;

        self.weights[cell] = new_sum;
        self.log_weights[cell] = new_log_sum;

        if self.possible_pattern_count[cell] <= 1 || new_sum < 1e-9 {
            self.entropies[cell] = 0.0;
        } else {
            let entropy = new_sum.ln() - (new_log_sum / new_sum);

            self.entropies[cell] = entropy.max(0.0);
        }
    }

    #[inline(always)]
    pub fn pattern_determined(&self, cell: CellIndex) -> bool {
        let count = self.possible_pattern_count[cell];

        count == 1
    }

    #[inline(always)]
    pub fn has_no_possible_patterns(&self, cell: CellIndex) -> bool {
        self.possible_pattern_count[cell] == 0
    }

    #[inline(always)]
    pub fn possible_pattern_count(&self, cell: CellIndex) -> i32 {
        self.possible_pattern_count[cell]
    }

    pub fn reset(&mut self) {
        self.possible_pattern_count.fill(self.t_count as i32);
        self.weights.fill(self.init_sum);
        self.log_weights.fill(self.init_log_sum);
        self.entropies.fill(self.init_entropy);
    }

    #[inline(always)]
    pub fn get_cell_entropy(&self, target: CellIndex) -> f64 {
        self.entropies[target]
    }

    #[inline(always)]
    pub fn get_cell_total_weight(&self, target: CellIndex) -> f64 {
        self.weights[target]
    }

    #[inline(always)]
    pub fn get_pattern_weight(&self, target: PatternIndex) -> f64 {
        self.pattern_weights[target]
    }

    #[inline(always)]
    pub fn entropies_ptr(&self) -> *const f64 {
        self.entropies.as_ptr()
    }
}
