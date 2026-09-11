// Shared test setup. Only the rendering tests need any of this; the logic
// tests run in node and are unaffected.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Testing Library only auto-cleans when the test framework's globals are
// switched on, and this repo imports describe/it/expect explicitly instead
// (see vitest.config.ts). Without this every test leaves its render mounted,
// the next one finds two of everything, and queries fail with "found multiple
// elements" on a component that is working perfectly.
afterEach(() => cleanup());
