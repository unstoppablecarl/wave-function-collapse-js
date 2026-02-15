type SymmetryDetail = {
  name: string
  description: string
}

export const SYMMETRY_OPTIONS: Record<number, SymmetryDetail> = {
  1: { name: 'None', description: 'Only the patterns as they appear in the source image.' },
  2: { name: 'Reflected', description: 'Includes the original patterns and their horizontal reflections.' },
  3: { name: 'Rotated 90°', description: 'Includes original, reflected, and a 90-degree rotation.' },
  4: { name: 'Rotated & Reflected', description: 'Includes 0° and 90° orientations plus their reflections.' },
  5: { name: 'Rotated 180°', description: 'Includes orientations up to 180°.' },
  6: { name: 'High Symmetry', description: 'Original plus five variations of rotations and flips.' },
  7: { name: 'Near Full', description: 'Includes seven of the eight possible D4 symmetries.' },
  8: {
    name: 'Full Dihedral (D4)',
    description: 'All 8 variations (4 rotations × 2 reflections). Ideal for top-down textures.',
  },
}

export const SYMMETRY_DROPDOWN = Object.entries(SYMMETRY_OPTIONS).map(
  ([key, value]) => {
    return {
      value: Number(key),
      text: `${key}: ${value.name}`,
    }
  })