module.exports = {
  devServer: {
    disableHostCheck: true,
  },
  publicPath: process.env.PUBLIC_PATH    || (process.env.NODE_ENV === 'production' ? '/momo-store/' : '/'),
};
