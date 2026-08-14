// checkpoint:01-event-contract
import type {} from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Notify listeners of one monotonically increasing pulse.
     * @param sequence - Pulse number, starting at one.
     * @mode parallel
     * @dshScopeScan unsupported
     */
    'pulse/tick'(sequence: number): Promise<void> | void
  }
}
