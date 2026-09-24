import RequestsPage from "../requests/page";

// Interim (Stage 2): the Cover tab shows the existing coverage screens
// until the five-step Cover wizard replaces them in Stage 3.
export default async function CoverPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  return RequestsPage({ searchParams: Promise.resolve({ tab: "coverage", error }) });
}
