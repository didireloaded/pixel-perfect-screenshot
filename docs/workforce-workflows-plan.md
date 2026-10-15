# Workforce workflow corrections

The company workplace is a confirmed geographic location captured during company setup.
Job destinations are separate. A job may span days; attendance remains one recorded workday
per clock-in, with a maximum duration of 24 hours. A job must describe whether employees
return to the office. Employees provide their job title during registration.

Work travel and meetings are work activities. Lunch and personal time stop GPS sharing.
Web tracking requires a visible, connected worker app and explicit location permission.
Permission prompts must explain their purpose and offer recovery after denial; notification
permission is separate and must not block employment access.

Worker home retains attendance, work progress and current job location. Activity recording
moves to Jobs. Jobs distinguish upcoming, active and completed work. Calendar details and
crew assignments use the same backend records in both apps. Workers can initiate private
company-scoped conversations with active managers, HR or finance contacts.

Manager calendar must fit mobile. Project management should expose real job progress,
crew and actions. Views must provide actionable operational navigation rather than inert
setup labels. Employee lists group by the departments stored in company records.

Overtime must preserve recorded timestamps and separate recorded time from approved pay.
The decision about a late overtime start tap is pending user input. AI must never create
attendance evidence; no live AI integration is claimed without a configured provider.

## Implemented 15 October 2026

- Company setup captures an address and confirmed workplace coordinates. Existing companies
  can confirm their workplace pin in Settings; GPS never guesses a workplace from a device.
- Worker registration collects a job title through the signup service and database.
- Job plans include an end date, return-to-office instructions and break/travel guidance.
  Actual job work remains attached to a recorded workday; the same project can have separate
  attendance records on later days. Managers can explicitly complete a project.
- Both calendars include every date in a job range. Workers see the assigned crew and details.
- Workers can initiate conversations with active managers, HR and finance contacts in their
  own company. Replies work in either direction and retain private thread membership.
- Work activities moved to Jobs. Worker home distinguishes usual workplace from active job
  location. Profile photo helper copy was removed. Dark theme uses consistent surface tokens.
- Employees group by their actual departments. Project management includes actionable status
  filters and completion. Views cards navigate to the relevant operational workflows; setup
  verification remains in Settings and never pretends to be a toggle.
- First-use phone setup explains location permission, denial recovery, foreground tracking
  and optional notifications. No GPS data is submitted merely to request permission.

Overtime start/backdating policy remains pending. No new overtime timer or automatic hours
adjustment was introduced in this release. Background AI remains unconnected. Physical device
GPS, push, offline recovery and mobile visual acceptance still require signed-in device testing.
