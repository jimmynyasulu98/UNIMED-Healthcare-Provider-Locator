export class LatestRequestCoordinator {
  private generation = 0;

  start() {
    this.generation += 1;
    return this.generation;
  }

  invalidate() {
    this.generation += 1;
  }

  isCurrent(requestId: number) {
    return requestId === this.generation;
  }
}
