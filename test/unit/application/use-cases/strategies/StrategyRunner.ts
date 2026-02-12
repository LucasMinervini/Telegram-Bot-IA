import { it } from 'vitest';

/**
 * Strategy pattern contract for unit tests.
 * Each strategy encapsulates its own arrange/act/assert flow.
 */
export interface TestStrategy<TContext, TResult> {
  name: string;
  arrange?(context: TContext): void | Promise<void>;
  act(context: TContext): Promise<TResult> | TResult;
  assert(result: TResult, context: TContext): void | Promise<void>;
  cleanup?(context: TContext): void | Promise<void>;
}

/**
 * Execute all strategies as individual test cases.
 */
export const runStrategies = <TContext, TResult>(
  createContext: () => TContext,
  strategies: TestStrategy<TContext, TResult>[],
): void => {
  strategies.forEach((strategy) => {
    it(strategy.name, async () => {
      const context = createContext();

      if (strategy.arrange) {
        await strategy.arrange(context);
      }

      const result = await strategy.act(context);
      await strategy.assert(result, context);

      if (strategy.cleanup) {
        await strategy.cleanup(context);
      }
    });
  });
};
