// Global fast-check configuration: at least 100 runs per property (testing strategy).
import fc from 'fast-check';

fc.configureGlobal({ numRuns: 100, verbose: 1 });
