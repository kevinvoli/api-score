import '../app/globals.css';

const preview = {
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'Command Center',
      values: [
        { name: 'Command Center', value: '#0B1220' },
        { name: 'Surface', value: '#111A2E' }
      ]
    },
    controls: { expanded: true },
    docs: { theme: undefined }
  },
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: '100vh',
          padding: '24px',
          background: 'var(--color-bg)'
        }}
      >
        <Story />
      </div>
    )
  ]
};

export default preview;
