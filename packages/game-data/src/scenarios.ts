/**
 * Scenario metadata used by early runtime bootstrapping.
 * During later milestones this package will be generated from source assets.
 */
export interface ScenarioDefinition {
  id: string;
  label: string;
  description: string;
  defaultSeed: number;
}

/**
 * Initial hand-authored scenario list.
 * `empty` is the safe baseline for deterministic loop verification.
 */
export const DEFAULT_SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: "empty",
    label: "Empty Simulation",
    description: "No ships or gameplay systems yet; used for deterministic loop checks.",
    defaultSeed: 0x0e11_7e01,
  },
  {
    id: "debug-combat",
    label: "Debug Combat Placeholder",
    description: "Reserved scenario id for the first combat migration slice.",
    defaultSeed: 0x0000_c0de,
  },
] as const;

/**
 * Resolve a scenario id to a known definition.
 * Returns `null` instead of throwing so app boot logic can apply a fallback.
 */
export function getScenarioById(scenarioId: string): ScenarioDefinition | null {
  return DEFAULT_SCENARIOS.find((scenario) => scenario.id === scenarioId) ?? null;
}
