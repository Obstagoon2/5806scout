"use client";

import { AppearanceEditor } from "@/components/AppearanceEditor";
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
import { useState } from "react";

type FormKey = "pitScout" | "matchScout";
type Tab = FormKey | "website";

const TAB_LABELS: Record<Tab, string> = {
  pitScout: "Pit Scout",
  matchScout: "Match Scout",
  website: "Website Customization",
};

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

  const [tab, setTab] = useState<Tab>("pitScout");
  // Form editing only ever operates on a real form; on the website tab this
  // falls back to pitScout but the form body below isn't rendered.
  const formKey: FormKey = tab === "website" ? "pitScout" : tab;
  // Local working copy of both customizations — null until the first edit,
  // when it forks from the live config. Edits stay local until Save writes
  // the whole doc back.
  const [drafts, setDrafts] = useState<Record<
    FormKey,
    FormCustomization
  > | null>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const working =
    drafts ??
    (config
      ? { pitScout: config.pitScout, matchScout: config.matchScout }
      : null);

  // New-question builder state.
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<CustomFieldKind>("text");
  const [newSection, setNewSection] = useState<string>(CUSTOM_SECTION_TITLE);
  const [newOptions, setNewOptions] = useState("");
  const [newRequired, setNewRequired] = useState(false);

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

  const draft = working?.[formKey];
  const defaults = FORMS[formKey].sections;
  const hidden = new Set(draft?.hiddenFieldIds ?? []);
  const removed = new Set(draft?.removedFieldIds ?? []);
  const removedDefaults = defaults
    .flatMap((section) => section.fields)
    .filter((field) => removed.has(field.id));
  const sectionChoices = [
    ...defaults.map((s) => s.title),
    CUSTOM_SECTION_TITLE,
  ];

  function updateDraft(update: (prev: FormCustomization) => FormCustomization) {
    if (working) {
      setDrafts({ ...working, [formKey]: update(working[formKey]) });
    }
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

  function removeDefaultQuestion(fieldId: string) {
    updateDraft((prev) => ({
      ...prev,
      // Clear any strike so a later restore brings the question back active.
      hiddenFieldIds: prev.hiddenFieldIds.filter((id) => id !== fieldId),
      removedFieldIds: [...prev.removedFieldIds, fieldId],
    }));
  }

  function restoreDefaultQuestion(fieldId: string) {
    updateDraft((prev) => ({
      ...prev,
      removedFieldIds: prev.removedFieldIds.filter((id) => id !== fieldId),
    }));
  }

  function removeQuestion(fieldId: string) {
    updateDraft((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((f) => f.id !== fieldId),
    }));
  }

  async function handleSave() {
    if (!working || !profile || !user || !dataTeamId) return;
    setStatus({ state: "saving" });
    try {
      await setDoc(
        doc(db, "teams", dataTeamId, "config", SCOUT_FORMS_DOC_ID),
        {
          pitScout: working.pitScout,
          matchScout: working.matchScout,
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
          Settings
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          {tab === "website"
            ? "Brand the app for your team — accent color, background, font, and the top-left logo. Changes apply to everyone."
            : "Tune the scout forms for your team — uncheck a question to strike it out, trash it to remove it, add your own. Changes apply to everyone on the team."}
        </p>
      </div>

      <div className="surface-card flex flex-wrap self-start p-0.5">
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded px-3.5 py-1.5 text-sm font-medium transition ${
              tab === key
                ? "bg-maroon-600 text-white"
                : "text-graphite-600 hover:text-graphite-900"
            }`}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {tab === "website" && <AppearanceEditor />}

      {tab !== "website" && !draft && (
        <div className="surface-panel px-6 py-10 text-center text-sm text-graphite-500">
          Loading your team&apos;s form settings…
        </div>
      )}

      {tab !== "website" && draft && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="section-title">Default questions</h2>
            {defaults.map((section) => {
              const visibleFields = section.fields.filter(
                (field) => !removed.has(field.id),
              );
              if (visibleFields.length === 0) return null;
              return (
                <div key={section.title} className="surface-card p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-maroon-700 dark:text-maroon-300">
                    <span aria-hidden className="h-2.5 w-1 bg-maroon-600" />
                    {section.title}
                  </h3>
                  <ul className="flex flex-col divide-y divide-graphite-100">
                    {visibleFields.map((field) => {
                      const isHidden = hidden.has(field.id);
                      return (
                        <li
                          key={field.id}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
                              checked={!isHidden}
                              onChange={() => toggleFieldVisible(field.id)}
                              aria-label={`${isHidden ? "Include" : "Strike"} ${field.label}`}
                              className="h-4 w-4 shrink-0 accent-maroon-600"
                            />
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
                          </label>
                          <button
                            type="button"
                            onClick={() => removeDefaultQuestion(field.id)}
                            aria-label={`Remove ${field.label}`}
                            title="Remove question"
                            className="shrink-0 rounded-md p-1.5 text-graphite-500 transition hover:bg-maroon-50 hover:text-maroon-600 dark:hover:text-maroon-400"
                          >
                            <TrashIcon />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}

            {removedDefaults.length > 0 && (
              <details className="surface-card p-4">
                <summary className="cursor-pointer text-sm text-graphite-500 transition hover:text-graphite-700">
                  Removed questions ({removedDefaults.length})
                </summary>
                <ul className="mt-2 flex flex-col divide-y divide-graphite-100">
                  {removedDefaults.map((field) => (
                    <li
                      key={field.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="truncate text-sm text-graphite-400">
                          {field.label}
                        </span>
                        <span className="badge bg-graphite-100 text-graphite-500">
                          {KIND_LABELS[field.kind]}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => restoreDefaultQuestion(field.id)}
                        aria-label={`Restore ${field.label}`}
                        title="Restore question"
                        className="shrink-0 rounded-md p-1.5 text-graphite-400 transition hover:bg-graphite-100 hover:text-graphite-700"
                      >
                        <RestoreIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
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
