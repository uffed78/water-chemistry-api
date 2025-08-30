// Custom Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeBetween(min: number, max: number): R;
    }
  }
}

export const customMatchers = {
  toBeBetween(received: number, min: number, max: number) {
    const pass = received >= min && received <= max;
    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be between ${min} and ${max}`
          : `Expected ${received} to be between ${min} and ${max}`
    };
  }
};

// Register the matchers
expect.extend(customMatchers);