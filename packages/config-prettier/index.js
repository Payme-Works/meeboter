module.exports = {
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'avoid',

  plugins: [
    require.resolve('prettier-plugin-tailwindcss'),
  ],

  // Tailwind CSS class sorting configuration
  tailwindFunctions: ['cn', 'clsx', 'cva', 'tw'],
  tailwindAttributes: ['tw'],
};
