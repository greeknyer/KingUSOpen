/** Resolve `./types` to `./types.ts`, which is what the bundler does. */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (err) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return next(specifier + '.ts', context)
    }
    throw err
  }
}
