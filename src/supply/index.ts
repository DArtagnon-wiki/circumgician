import type { RuneSupplyStrategy } from './RuneSupplyStrategy'
import { FixedHandRefillStrategy, type FixedHandRefillParams } from './FixedHandRefillStrategy'
import { TimeDripStrategy, type TimeDripParams } from './TimeDripStrategy'
import { EventTriggeredUnlockStrategy, type EventTriggeredUnlockParams } from './EventTriggeredUnlockStrategy'

export type SupplyConfig =
  | { type: 'fixedHand'; params: FixedHandRefillParams }
  | { type: 'timeDrip'; params: TimeDripParams }
  | { type: 'eventUnlock'; params: EventTriggeredUnlockParams }

export function createStrategy(config: SupplyConfig): RuneSupplyStrategy {
  switch (config.type) {
    case 'fixedHand':
      return new FixedHandRefillStrategy(config.params)
    case 'timeDrip':
      return new TimeDripStrategy(config.params)
    case 'eventUnlock':
      return new EventTriggeredUnlockStrategy(config.params)
  }
}

export type { RuneSupplyStrategy, SupplyContext, RuneShapePair } from './RuneSupplyStrategy'
