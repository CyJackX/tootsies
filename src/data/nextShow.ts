export type NextShowPhase = "submissions" | "tickets";

const submissionDetails = [
  { label: "Submission Deadline", value: "July 26, 2026" },
  { label: "Notification of Acceptance", value: "July 28, 2026" },
];

const showDetails = [
  { label: "Show Date", value: "October 3, 2026, 6:30 Doors / 7:30 Show" },
  { label: "Location", value: "Littlefield, Brooklyn" },
];

export const nextShow = {
  phase: "tickets" satisfies NextShowPhase,
  title: "Tootsie's Video Vault October 2026",
  youtubeEmbedUrl: "https://www.youtube.com/embed/Fyhid9vehyY",
  phases: {
    submissions: {
      url: "https://forms.gle/eeLc7K1Hh22PV6S86",
      heading: "Submit to the next show!",
      buttonText: "Submission Form here!",
      buttonAlt: "Submit Button",
      details: [...submissionDetails, ...showDetails],
    },
    tickets: {
      url: "https://www.eventbrite.com/e/tootsies-video-vault-7-tickets-1999618457635",
      heading: "Attend the next show!",
      buttonText: "Tickets here!",
      buttonAlt: "Ticket Button",
      details: showDetails,
    },
  },
};

export const nextShowPhase = nextShow.phases[nextShow.phase];
