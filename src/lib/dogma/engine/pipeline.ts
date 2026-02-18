import type { EngineTrace } from "./types";

export class DogmaTraceCollector {
  private readonly entries: EngineTrace[] = [];

  add(stage: string, message: string, source?: string): void {
    this.entries.push({ stage, message, source });
  }

  flush(): EngineTrace[] {
    return [...this.entries];
  }
}
