import type { FormSection } from "@/lib/formSchema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SchemaForm } from "./SchemaForm";

const sections: readonly FormSection[] = [
  {
    title: "Basics",
    fields: [
      { kind: "select", id: "drive", label: "Drive", options: ["Swerve", "Tank"] },
      { kind: "number", id: "weight", label: "Weight", unit: "lbs" },
      { kind: "textarea", id: "notes", label: "Notes" },
      { kind: "multiselect", id: "mechs", label: "Mechs", options: ["Arm", "Climber"] },
      { kind: "counter", id: "scored", label: "Scored", max: 2 },
    ],
  },
];

const values = { drive: null, weight: null, notes: null, mechs: [], scored: 0 };

describe("SchemaForm", () => {
  it("renders every field from the config", () => {
    render(<SchemaForm sections={sections} values={values} onChange={() => {}} />);

    expect(screen.getByText("Basics")).toBeInTheDocument();
    expect(screen.getByLabelText("Drive")).toBeInTheDocument();
    expect(screen.getByLabelText("Weight (lbs)")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Arm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Climber" })).toBeInTheDocument();
  });

  it("emits onChange for select and number fields", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SchemaForm sections={sections} values={values} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Drive"), "Swerve");
    expect(onChange).toHaveBeenCalledWith("drive", "Swerve");

    await user.type(screen.getByLabelText("Weight (lbs)"), "5");
    expect(onChange).toHaveBeenCalledWith("weight", 5);
  });

  it("toggles multiselect options on and off", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <SchemaForm sections={sections} values={values} onChange={onChange} />,
    );

    await user.click(screen.getByRole("button", { name: "Arm" }));
    expect(onChange).toHaveBeenCalledWith("mechs", ["Arm"]);

    rerender(
      <SchemaForm
        sections={sections}
        values={{ ...values, mechs: ["Arm"] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Arm" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Arm" }));
    expect(onChange).toHaveBeenLastCalledWith("mechs", []);
  });

  it("increments and clamps the counter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <SchemaForm sections={sections} values={values} onChange={onChange} />,
    );

    expect(screen.getByRole("button", { name: "Decrease Scored" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Increase Scored" }));
    expect(onChange).toHaveBeenCalledWith("scored", 1);

    rerender(
      <SchemaForm
        sections={sections}
        values={{ ...values, scored: 2 }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Increase Scored" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Decrease Scored" }));
    expect(onChange).toHaveBeenLastCalledWith("scored", 1);
  });
});
