import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PasswordField } from "./PasswordField";

function Harness() {
  const [value, setValue] = useState("");
  return (
    <PasswordField
      label="Password"
      value={value}
      onChange={setValue}
      autoComplete="new-password"
      minLength={6}
    />
  );
}

/** The input is only reachable by role once it's revealed, so go by label. */
function field(): HTMLInputElement {
  return screen.getByLabelText("Password") as HTMLInputElement;
}

describe("PasswordField", () => {
  it("masks what you type until you ask to see it", () => {
    render(<Harness />);

    expect(field().type).toBe("password");
    expect(screen.getByRole("button")).toHaveTextContent("Show");
  });

  it("reveals and re-hides the password on the toggle", async () => {
    render(<Harness />);
    const toggle = screen.getByRole("button");

    await userEvent.click(toggle);
    expect(field().type).toBe("text");
    expect(toggle).toHaveTextContent("Hide");
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(toggle);
    expect(field().type).toBe("password");
    expect(toggle).toHaveTextContent("Show");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps what was typed when the mask comes off", async () => {
    render(<Harness />);

    await userEvent.type(field(), "hunter2!");
    await userEvent.click(screen.getByRole("button"));

    expect(field().value).toBe("hunter2!");
  });

  it("stays a real password field — required, minLength, and autocomplete", () => {
    render(<Harness />);

    expect(field()).toBeRequired();
    expect(field()).toHaveAttribute("minLength", "6");
    expect(field()).toHaveAttribute("autocomplete", "new-password");
  });

  it("never submits the form it sits in", () => {
    render(<Harness />);

    // A bare <button> inside a <form> defaults to type=submit, which would
    // fire the signup request every time someone peeked at their password.
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});
