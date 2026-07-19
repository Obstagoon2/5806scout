"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  CUSTOM_SECTION_TITLE,
  makeCustomFieldId,
  SCOUT_FORMS_DOC_ID,
  type CustomField,
  type CustomFieldKind,
  type FormCustomization,
} from "@/lib/customForms";
import { db } from "@/lib/firebase/client";
import type { FormSection } from "@/lib/formSchema";
import { MATCH_SCOUT_SECTIONS } from "@/lib/matchScoutSchema";
import { PIT_SCOUT_SECTIONS } from "@/lib/pitScoutSchema";
import { useScoutForms } from "@/lib/useScoutForms";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

type FormKey = "pitScout" | "matchScout";

const FORMS: Record<
  FormKey,
  { label: string; sections: readonly FormSection[] }
> = {
  pitScout: { label: "Pit Scout", sections: PIT_SCOUT_SECTIONS },
  matchScout: { label: "Match Scout", sections: MATCH_SCOUT_SECTIONS },
};

const KIND_LABELS: Record<CustomFieldKind, string> = {
  text: "Short text",
  textarea: "Long text",
  select: "Dropdown",
  multiselect: "Multi-select",
  counter: "Tally counter",
  number: "Number",
};

/** Kinds whose FieldDef supports the required flag. */
const REQUIRABLE_KINDS: readonly CustomFieldKind[] = [
  "text",
  "textarea",
  "select",
  "number",
];

type Status =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "error"; message: string };

/** Small trash-can glyph, matching the app's inline-SVG icon convention. */
function TrashIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6m5 5v6m4-6v6" />
    </svg>
  );
}

/** Counter-clockwise arrow — restores a removed default question. */
function RestoreIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v5h5M3.05 13a9 9 0 1 0 2.6-6.4L3 8" />
    </svg>
  );
}

export default function FormSettingsPage() {
  const { profile, user, dataTeamId } = useAuth();
  const { config } = useScoutForms();

  const [formKey, setFormKey] = useState<FormKey>("pitScout");
  // Local working copy of both customizations, seeded once the remote config
  // loads; edits stay local until Save writes the whole doc back.
  const [drafts, setDrafts] = useState<Record<
    FormKey,
    FormCustomization
  > | null>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });

  // New-question builder state.
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<CustomFieldKind>("text");
  const [newSection, setNewSection] = useState<string>(CUSTOM_SECTION_TITLE);
  const [newOptions, setNewOptions] = useState("");
  const [newRequired, setNewRequired] = useState(false);

  useEffect(() => {
    if (config && !drafts) {
      setDrafts({ pitScout: config.pitScout, matchScout: config.matchScout });
    }
  }, [config, drafts]);

  const isAdmin = profile?.role === "admin";

  if (profile && !isAdmin) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
        <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-12 text-center text-sm text-graphite-500">
          Form Setup is only available to admins.
        </div>
      </main>
    );
  }

  const draft = drafts?.[formKey];
  const defaults = FORMS[formKey].sections;
  const hidden = new Set(draft?.hiddenFieldIds ?? []);
  const sectionChoices = [
    ...defaults.map((s) => s.title),
    CUSTOM_SECTION_TITLE,
  ];

  function updateDraft(update: (prev: FormCustomization) => FormCustomization) {
    setDrafts((prev) =>
      prev ? { ...prev, [formKey]: update(prev[formKey]) } : prev,
    );
    if (status.state !== "idle") setStatus({ state: "idle" });
  }

  function toggleFieldVisible(fieldId: string) {
    updateDraft((prev) => ({
      ...prev,
      hiddenFieldIds: prev.hiddenFieldIds.includes(fieldId)
        ? prev.hiddenFieldIds.filter((id) => id !== fieldId)
        : [...prev.hiddenFieldIds, fieldId],
    }));
  }

  function addQuestion() {
    if (!draft) return;
    const label = newLabel.trim();
    if (!label) {
      setStatus({ state: "error", message: "The question needs a label." });
      return;
    }
    const options = newOptions
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const needsOptions = newKind === "select" || newKind === "multiselect";
    if (needsOptions && options.length === 0) {
      setStatus({
        state: "error",
        message: "Add at least one option (one per line).",
      });
      return;
    }

    const taken = new Set([
      ...defaults.flatMap((s) => s.fields.map((f) => f.id)),
      ...draft.customFields.map((f) => f.id),
    ]);
    const field: CustomField = {
      id: makeCustomFieldId(label, taken),
      kind: newKind,
      label,
      section: newSection,
      ...(needsOptions ? { options } : {}),
      ...(newRequired && REQUIRABLE_KINDS.includes(newKind)
        ? { required: true }
        : {}),
    };
    updateDraft((prev) => ({
      ...prev,
      customFields: [...prev.customFields, field],
    }));
    setNewLabel("");
    setNewOptions("");
    setNewRequired(false);
  }

  function removeQuestion(fieldId: string) {
    updateDraft((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((f) => f.id !== fieldId),
    }));
  }

  async function handleSave() {
    if (!drafts || !profile || !user || !dataTeamId) return;
    setStatus({ state: "saving" });
    try {
      await setDoc(
        doc(db, "teams", dataTeamId, "config", SCOUT_FORMS_DOC_ID),
        {
          pitScout: drafts.pitScout,
          matchScout: drafts.matchScout,
          updatedAt: serverTimestamp(),
          updatedByUid: user.uid,
          updatedByName: profile.fullName,
        },
        { merge: true },
      );
      setStatus({ state: "saved" });
    } catch (err) {
      setStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  const needsOptions = newKind === "select" || newKind === "multiselect";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-graphite-900">
          <span aria-hidden className="h-5 w-1.5 bg-maroon-600" />
          Form Setup
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          Tune the scout forms for your team — hide questions you don&apos;t
          need, add your own. Changes apply to everyone on the team.
        </p>
      </div>

      <div className="surface-card flex self-start p-0.5">
        {(Object.keys(FORMS) as FormKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFormKey(key)}
            className={`rounded px-3.5 py-1.5 text-sm font-medium transition ${
              formKey === key
                ? "bg-maroon-600 text-white"
                : "text-graphite-600 hover:text-graphite-900"
            }`}
          >
            {FORMS[key].label}
          </button>
        ))}
      </div>

      {!draft && (
        <div className="surface-panel px-6 py-10 text-center text-sm text-graphite-500">
          Loading your team&apos;s form settings…
        </div>
      )}

      {draft && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="section-title">Default questions</h2>
            {defaults.map((section) => (
              <div key={section.title} className="surface-card p-4">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-maroon-700 dark:text-maroon-300">
                  <span aria-hidden className="h-2.5 w-1 bg-maroon-600" />
                  {section.title}
                </h3>
                <ul className="flex flex-col divide-y divide-graphite-100">
                  {section.fields.map((field) => {
                    const isHidden = hidden.has(field.id);
                    return (
                      <li
                        key={field.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className={`truncate text-sm ${
                              isHidden
                                ? "text-graphite-400 line-through"
                                : "text-graphite-700"
                            }`}
                          >
                            {field.label}
                          </span>
                          <span className="badge bg-graphite-100 text-graphite-500">
                            {KIND_LABELS[field.kind]}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleFieldVisible(field.id)}
                          aria-label={`${isHidden ? "Restore" : "Remove"} ${field.label}`}
                          title={isHidden ? "Restore question" : "Remove question"}
                          className={`shrink-0 rounded-md p-1.5 transition ${
                            isHidden
                              ? "text-graphite-400 hover:bg-graphite-100 hover:text-graphite-700"
                              : "text-graphite-500 hover:bg-maroon-50 hover:text-maroon-600 dark:hover:text-maroon-400"
                          }`}
                        >
                          {isHidden ? <RestoreIcon /> : <TrashIcon />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="section-title">Your team&apos;s questions</h2>
            {draft.customFields.length > 0 && (
              <ul className="surface-card divide-y divide-graphite-100">
                {draft.customFields.map((field) => (
                  <li
                    key={field.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-graphite-900">
                        {field.label}
                        {field.required && (
                          <span className="ml-0.5 text-maroon-600 dark:text-maroon-400">*</span>
                        )}
                      </span>
                      <span className="text-xs text-graphite-500">
                        {KIND_LABELS[field.kind]} · {field.section}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeQuestion(field.id)}
                      aria-label={`Remove ${field.label}`}
                      title="Remove question"
                      className="shrink-0 rounded-md p-1.5 text-graphite-500 transition hover:bg-maroon-50 hover:text-maroon-600 dark:hover:text-maroon-400"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form
              className="surface-panel flex flex-col gap-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                addQuestion();
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-graphite-700">
                  Question
                </span>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. Can they score in the trap?"
                  className="field-input"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-graphite-700">
                    Answer type
                  </span>
                  <select
                    value={newKind}
                    onChange={(e) =>
                      setNewKind(e.target.value as CustomFieldKind)
                    }
                    className="field-input"
                  >
                    {(Object.keys(KIND_LABELS) as CustomFieldKind[]).map(
                      (kind) => (
                        <option key={kind} value={kind}>
                          {KIND_LABELS[kind]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-graphite-700">
                    Section
                  </span>
                  <select
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    className="field-input"
                  >
                    {[...new Set(sectionChoices)].map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {needsOptions && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-graphite-700">
                    Options — one per line
                  </span>
                  <textarea
                    rows={3}
                    value={newOptions}
                    onChange={(e) => setNewOptions(e.target.value)}
                    placeholder={"Yes\nNo\nSometimes"}
                    className="field-input"
                  />
                </label>
              )}

              {REQUIRABLE_KINDS.includes(newKind) && (
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newRequired}
                    onChange={(e) => setNewRequired(e.target.checked)}
                    className="h-4 w-4 accent-maroon-600"
                  />
                  <span className="text-sm text-graphite-700">
                    Required answer
                  </span>
                </label>
              )}

              <button type="submit" className="btn-secondary self-start">
                Add question
              </button>
            </form>
          </section>

          {status.state === "error" && (
            <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
              {status.message}
            </p>
          )}
          {status.state === "saved" && (
            <p className="badge-success rounded-md px-3 py-2 text-sm normal-case tracking-normal">
              Saved — scouts see the updated form immediately.
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={status.state === "saving"}
            className="btn-primary"
          >
            {status.state === "saving" ? "Saving…" : "Save form settings"}
          </button>
        </>
      )}
    </main>
  );
}
