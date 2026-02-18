const { mergeConfig } = require('vite');

/** @type {import('@storybook/react').StorybookConfig} */
const config = {
  stories: ['../components/**/*.stories.@(ts|tsx|mdx)', '../app/**/*.stories.@(ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions'
  ],
  framework: {
    name: '@storybook/react',
    options: {
      fastRefresh: true
    }
  },
  docs: {
    autodocs: 'tag'
  },
  async viteFinal(configStorybook) {
    return mergeConfig(configStorybook, {
      css: {
        preprocessorOptions: {
          css: {}
        }
      }
    });
  }
};

module.exports = config;
