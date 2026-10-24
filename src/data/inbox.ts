// The club inbox: contact@neurodiversitum.org. Incoming mail becomes a row in the Notion
// database "Club Inbox" and is forwarded to the board. Change the board list here.
export const inbox = {
  /** The address the Worker receives (Email Routing rule "contact" sends to the Worker). */
  address: 'contact@neurodiversitum.org',
  /** Addresses that never create a row or a forward (our own senders). */
  ownAddresses: ['contact@neurodiversitum.org', 'noreply@neurodiversitum.org'],
  /**
   * Board members. Every address must be a verified destination address in Email Routing.
   * Placeholders in the public repository: put the real board addresses here before you deploy.
   */
  board: [
    { name: 'Board Member One', email: 'board-member-1@example.org' },
    { name: 'Board Member Two', email: 'board-member-2@example.org' },
  ],
  /** One reminder when a message is still New without an Owner after this many minutes. */
  reminderAfterMinutes: 60,
  /** Daily summary of open messages at this hour, Europe/Berlin. */
  summaryHour: 20,
  /** Length of the text preview stored in Notion. */
  previewLength: 300,
} as const;
