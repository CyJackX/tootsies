export type NextShowPhase = "between-shows" | "submissions" | "tickets";

export interface Show {
  phase: NextShowPhase;
  youtubeEmbedUrl: string;
  ticketsUrl: string;
  id: string;
  subtitle: string;
  open: boolean;
  screeningAt: string;
  venue: string;
  deadline: string;
  notificationDate: string;
  productionInstructions: string;
  feeCents: number;
  currency: string;
  spreadsheetId: string;
  sheetTab?: string; // Defaults to the show ID.
}

// Edit this configuration for each new show.
/*
export const activeApplicationShow: ApplicationShow = {
  id: "spring-2027",
  title: "Tootsie's Video Vault — Spring 2027",
  open: false,
  screeningAt: "May 15, 2027 at 7 PM",
  venue: "Littlefield, Brooklyn",
  deadline: "2027-02-01T23:59:00-05:00",
  notificationDate: "February 15, 2027",
  productionInstructions:
    "Create a new 16:9 video under 3 minutes long. " +
    "Selected participants must deliver their finished video by May 1, 2027.",
  feeCents: 2500,
  currency: "usd",
  spreadsheetId: "1wDLSPhDhqw5DF9PL7iuG5cA7qT29kM-gw3HBsoD-MYY",
};*/
export const nextShow: Show = {
  phase: "between-shows", // Switch to "submissions" or "tickets" when ready.
  youtubeEmbedUrl: "https://www.youtube.com/embed/Fyhid9vehyY",
  ticketsUrl: "", // Add the ticket URL for this show when ready.
  id: "summer-2027",
  subtitle: "Summer 2027",
  open: false,
  screeningAt: "June 4, 2027 7:30PM", 
  venue: "Littlefield, Brooklyn", 
  deadline: "February 28, 2027 11:59 PM", 
  notificationDate: "March 7, 2027",
  productionInstructions: "Create a new 16:9 video under 3 minutes long.",
  feeCents: 2500,
  currency: "usd",
  spreadsheetId: "1wDLSPhDhqw5DF9PL7iuG5cA7qT29kM-gw3HBsoD-MYY",
};
export function feeLabel(show: Show) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: show.currency }).format(show.feeCents / 100);
}
export function applicationsOpen(show: Show) {
  return show.open && show.phase !== "between-shows";
}
// Homepage details derive from the same dates and venue used by the form.
export function homepagePhase(show: Show) {
  if (show.phase === "between-shows") return {
    url: "",
    heading: "Next show coming soon!",
    description: "We're between shows. Check back for the next event and submission dates!",
    buttonText: "",
    buttonAlt: "",
    details: [],
  };
  const showDetails = [
    { label: "Show Date", value: show.screeningAt },
    { label: "Location", value: show.venue },
  ].filter(detail => detail.value);
  if (show.phase === "tickets") return {
    url: show.ticketsUrl,
    heading: "Attend the next show!",
    buttonText: "Tickets here!",
    buttonAlt: "Ticket Button",
    details: showDetails,
  };
  return {
    url: "/submit",
    heading: "Submit to the next show!",
    buttonText: "Submission Form here!",
    buttonAlt: "Submit Button",
    details: [
      { label: "Submission Deadline", value: show.deadline },
      { label: "Notification of Acceptance", value: show.notificationDate },
      ...showDetails,
    ].filter(detail => detail.value),
  };
}
export const nextShowPhase = homepagePhase(nextShow);
