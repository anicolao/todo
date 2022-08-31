const { expect: untypedExpect } = await import("@esm-bundle" + "/chai");
export const expect: typeof import("chai").expect = untypedExpect;

import { auth, waiting } from './auth';

describe("auth", () => {
  it("waiting message is initialized correctly", () => {
  	const nextState = auth({}, waiting());
    expect(nextState.authMessage).to.equal("Waiting...");
    expect(nextState.signedIn).to.equal(false);
  });
});

