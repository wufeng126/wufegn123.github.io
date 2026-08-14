// 环境感知的 Babel 配置（替代原 .babelrc）
//
// 修复背景：原 .babelrc 固定 preset-react.development: true 且始终挂载
// @react-dev-inspector/babel-plugin，导致生产构建也以 React 开发模式编译
// （包体积更大、运行时更慢、丢失生产优化）。
//
// - 开发环境：启用 react-dev-inspector 插件 + React 开发模式（热更新、调试信息）
// - 生产环境：不挂 inspector 插件、React 生产模式
const isProd =
  process.env.NODE_ENV === 'production' || process.env.COZE_PROJECT_ENV === 'PROD';

module.exports = {
  presets: [
    [
      'next/babel',
      {
        'preset-react': {
          development: !isProd,
        },
      },
    ],
  ],
  plugins: isProd ? [] : ['@react-dev-inspector/babel-plugin'],
};
