export interface Answers {
  name: string; email: string; socials: string; location: string; attendance: string; attendedBefore: string;
  newVideo: string; portfolio: string; notes: string; consent: boolean;
}
export function validateAnswers(input: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const text = (key: string, required: boolean, max: number) => {
    const value = typeof input[key] === "string" ? input[key].trim() : "";
    if (required && !value) errors[key] = "Please complete this field.";
    if (value.length > max) errors[key] = `Please use at most ${max} characters.`;
    return value;
  };
  const answers: Answers = {
    name: text("name", true, 200), email: text("email", true, 254),
    socials: text("socials", false, 1000), location: text("location", true, 200),
    attendance: text("attendance", true, 3), attendedBefore: text("attendedBefore", true, 3), newVideo: text("newVideo", true, 10),
    portfolio: text("portfolio", true, 5000),
    notes: text("notes", false, 5000), consent: input.consent === true,
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email)) errors.email = "Enter a valid email address.";
  if (!["Yes", "No"].includes(answers.attendance)) errors.attendance = "Choose Yes or No.";
  if (!["Yes", "No"].includes(answers.attendedBefore)) errors.attendedBefore = "Choose Yes or No.";
  if (answers.newVideo.toUpperCase() !== "YESTOOTSIE") errors.newVideo = "Type YESTOOTSIE to confirm.";
  if (!answers.consent) errors.consent = "Authorize the conditional fee to continue.";
  return { answers, errors };
}
