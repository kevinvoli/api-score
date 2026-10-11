import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { MonitoringController } from './monitoring.controller';

describe('MonitoringController access metadata', () => {
  const reflector = new Reflector();

  it('laisse uniquement le health check public', () => {
    expect(
      reflector.get(IS_PUBLIC_KEY, MonitoringController.prototype.getHealth),
    ).toBe(true);
    expect(
      reflector.get(
        IS_PUBLIC_KEY,
        MonitoringController.prototype.getUsageMetrics,
      ),
    ).toBeUndefined();
    expect(
      reflector.get(
        IS_PUBLIC_KEY,
        MonitoringController.prototype.getPipelineMetrics,
      ),
    ).toBeUndefined();
  });
});
