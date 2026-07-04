/**
 * docsNav.ts — sidebar navigation manifest for the docs.
 * Add a new entry here + a corresponding .md file in src/docs/ to add a page.
 */

export interface DocSection {
  id: string;
  label: string;
  file: string;
  children?: { id: string; label: string; anchor: string }[];
}

export const DOCS_NAV: DocSection[] = [
  {
    id: "quickstart",
    label: "Quickstart",
    file: "01-quickstart.md",
  },
  {
    id: "authentication",
    label: "Authentication",
    file: "02-authentication.md",
  },
  {
    id: "orders",
    label: "Orders",
    file: "03-orders.md",
  },
  {
    id: "webhooks",
    label: "Webhooks",
    file: "04-webhooks.md",
  },
  {
    id: "exceptions",
    label: "Exceptions & Refunds",
    file: "05-exceptions.md",
  },
  {
    id: "amounts",
    label: "Amounts & Units",
    file: "06-amounts.md",
  },
  {
    id: "errors",
    label: "Errors",
    file: "07-errors.md",
  },
];
