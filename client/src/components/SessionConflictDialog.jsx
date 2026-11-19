import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { blockDate, fetchRescheduleSuggestions } from "../api/availability.js";
import { fetchProfessionalBookings, rescheduleProfessionalBooking } from "../api/bookings.js";
import { formatSessionDate, formatSessionTime } from "../lib/schedule.js";

// Shown when a professional blocks a date that already has sessions. Each choice ends with the day blocked.
function SessionConflictDialog({ token, timezone, date, sessions, onBlocked, onClose }) {
  const [mode, setMode] = useState("choose");
  const [remaining, setRemaining] = useState(sessions);
  const [openSlots, setOpenSlots] = useState(null);
  const [choices, setChoices] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editDay, setEditDay] = useState("");
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dayLabel = formatSessionDate(`${date}T00:00:00Z`, "UTC");

  async function blockWith(resolution) {
    setBusy(true);
    setError("");
    try {
      const data = await blockDate(token, date, resolution);
      onBlocked(data.blocked_dates);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  // Loads the suggested new time for each session, plus the professional's open slots for the day picker.
  async function openReschedule() {
    setMode("reschedule");
    if (suggestionsLoaded) return;
    setBusy(true);
    setError("");
    try {
      const [suggestionData, bookingData] = await Promise.all([
        fetchRescheduleSuggestions(token, date),
        fetchProfessionalBookings(token),
      ]);
      setChoices(
        Object.fromEntries(
          suggestionData.sessions.filter((session) => session.suggested).map((session) => [session.id, session.suggested.start]),
        ),
      );
      setOpenSlots(bookingData.slots.filter((slot) => slot.member === null && slot.start.slice(0, 10) !== date));
      setSuggestionsLoaded(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Moves sessions one at a time. If one fails, the sessions already moved stay moved and the rest remain listed.
  async function moveSessionsAndBlock() {
    setBusy(true);
    setError("");
    try {
      for (const session of remaining) {
        await rescheduleProfessionalBooking(token, session.id, choices[session.id]);
        setRemaining((current) => current.filter((item) => item.id !== session.id));
      }
      const data = await blockDate(token, date);
      onBlocked(data.blocked_dates);
    } catch (err) {
      setError(`${err.message}. Sessions moved so far are updated; choose again for the rest.`);
      setBusy(false);
    }
  }

  // Open days, as YYYY-MM-DD in the professional's timezone (slot strings carry that zone's offset).
  const days = [...new Set((openSlots ?? []).map((slot) => slot.start.slice(0, 10)))];

  // Times on the picked day, leaving out any time already chosen for another session.
  function timesOn(sessionId) {
    return (openSlots ?? []).filter(
      (slot) =>
        slot.start.slice(0, 10) === editDay &&
        !Object.entries(choices).some(
          ([otherId, start]) => otherId !== sessionId && Date.parse(start) === Date.parse(slot.start),
        ),
    );
  }

  function startEditing(session) {
    const current = choices[session.id];
    setEditingId(session.id);
    setEditDay(current ? current.slice(0, 10) : (days[0] ?? ""));
  }

  function chooseTime(sessionId, start) {
    setChoices((current) => ({ ...current, [sessionId]: start }));
    setEditingId(null);
  }

  const allChosen = remaining.every((session) => choices[session.id]);

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}>
        {dayLabel} has {remaining.length} booked {remaining.length === 1 ? "session" : "sessions"}
        <IconButton aria-label="Close" onClick={onClose} disabled={busy} size="small" sx={{ mt: -0.5, mr: -1 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}

          {mode === "choose" && (
            <List dense disablePadding>
              {remaining.map((session) => (
                <ListItem key={session.id} disableGutters>
                  <ListItemText
                    primary={`${formatSessionTime(session.start, timezone)} – ${formatSessionTime(session.end, timezone)}`}
                    secondary={`with ${session.member?.name ?? "member"}`}
                  />
                </ListItem>
              ))}
            </List>
          )}

          {mode === "choose" && (
            <Typography variant="body2" color="text.secondary">
              Cancelling or rescheduling notifies each member in the app.
            </Typography>
          )}

          {mode === "reschedule" && (
            <Stack spacing={1.5}>
              {remaining.map((session) => {
                const chosen = choices[session.id];
                return (
                  <Box key={session.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                    <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2">
                          {formatSessionTime(session.start, timezone)} – {formatSessionTime(session.end, timezone)} with{" "}
                          {session.member?.name ?? "member"}
                        </Typography>
                        <Typography variant="body2" color={chosen ? "text.secondary" : "error"}>
                          {chosen
                            ? `Moves to ${formatSessionDate(chosen, timezone)} · ${formatSessionTime(chosen, timezone)}`
                            : "No new time yet. Choose one."}
                        </Typography>
                      </Box>
                      <Button size="small" onClick={() => startEditing(session)} disabled={busy || !openSlots}>
                        Change
                      </Button>
                    </Stack>

                    {editingId === session.id && (
                      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                        <FormControl size="small" sx={{ minWidth: 180 }}>
                          <InputLabel id={`day-${session.id}`}>Day</InputLabel>
                          <Select
                            labelId={`day-${session.id}`}
                            label="Day"
                            value={editDay}
                            onChange={(event) => setEditDay(event.target.value)}
                          >
                            {days.map((day) => (
                              <MenuItem key={day} value={day}>
                                {formatSessionDate(`${day}T00:00:00Z`, "UTC")}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        {timesOn(session.id).map((slot) => (
                          <Button
                            key={slot.start}
                            size="small"
                            variant={chosen && Date.parse(chosen) === Date.parse(slot.start) ? "contained" : "outlined"}
                            onClick={() => chooseTime(session.id, slot.start)}
                          >
                            {formatSessionTime(slot.start, timezone)}
                          </Button>
                        ))}
                        {timesOn(session.id).length === 0 && (
                          <Typography variant="caption" color="text.secondary">
                            No open times on this day.
                          </Typography>
                        )}
                      </Stack>
                    )}
                  </Box>
                );
              })}
              {openSlots && days.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  No open slots are available in the next few weeks.
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ flexWrap: "nowrap", justifyContent: "flex-end", gap: 1, px: 3, pb: 2, "& .MuiButton-root": { whiteSpace: "nowrap" } }}>
        {mode === "choose" ? (
          <>
            <Button variant="outlined" onClick={() => blockWith("keep")} disabled={busy}>
              Keep sessions
            </Button>
            <Button variant="outlined" color="error" onClick={() => blockWith("cancel")} disabled={busy}>
              Cancel sessions
            </Button>
            <Button
              variant="contained"
              onClick={openReschedule}
              disabled={busy}
              sx={{ bgcolor: "#13595e", "&:hover": { bgcolor: "#0e474b" } }}
            >
              Reschedule sessions
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setMode("choose")} disabled={busy} sx={{ mr: "auto" }}>
              Back
            </Button>
            <Button
              variant="contained"
              onClick={moveSessionsAndBlock}
              disabled={busy || !allChosen || remaining.length === 0}
              sx={{ bgcolor: "#13595e", "&:hover": { bgcolor: "#0e474b" } }}
            >
              Move sessions and block day
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default SessionConflictDialog;
