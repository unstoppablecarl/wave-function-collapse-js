const imageModules = import.meta.glob('../assets/*.png', { eager: true })

export const EXAMPLE_IMAGES = Object.values(imageModules).map(
  (module) => (module as any).default,
)