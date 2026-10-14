# Company roles and leave balances

Owners manage company settings, permissions and payable-hour approvals. HR managers
manage employee records, access approval, worker code recovery and leave. Operations
managers manage jobs, tasks, operational requests, attendance corrections and workplace
reports. Workers keep their own account and attendance access. HR can read attendance
reports but cannot change attendance or view live employee locations.

Existing managers retain their prior full authority as Owners. New company creators
become Owners. Only an Owner can change access roles. At least one active, signed-up
Owner must remain. Promoted code-based employees can sign in to the manager app using
their existing employee number and access code. HR cannot reset a privileged account's
code. Owners can recover promoted staff accounts.

Permissions are enforced in the command RPC, credential RPC and Storage helpers.
Snapshots remove payroll records from HR/Operations and hide private leave requests
from Operations. Approved leave dates remain available to Operations with reasons,
private descriptions and leave categories removed. Navigation follows the same roles;
it is not the security boundary. General workspace notes remain shared among managers.

In Requests, Owners and HR configure company working weekdays and hours per full day.
They enter annual, sick and personal allowances separately for each employee and
calendar year, with an explanation. There is no assumed statutory entitlement,
automatic accrual or carryover. Public holidays are not automatically excluded.

Workers choose annual, sick, personal or unpaid leave. Pending requests do not reserve
or consume balances. Approval charges only configured working days; hourly requests
charge their entered duration. Cross-year requests use each year's allowance. Approval
fails if any required allowance is missing or insufficient, or the request overlaps
approved leave. Company-level locking serializes approvals and allowance changes.

Each deduction records the policy revision and calculation used at approval. Later
policy changes preserve those deductions. Allowances cannot be reduced below approved
usage. Unpaid leave consumes no allowance. Existing approved unclassified requests
remain unchanged; pending older requests must be classified before approval once
balance settings are configured. No existing attendance or payable time is rewritten.

SQL tests cover role escalation, the last Owner, recovery permissions, company isolation,
private-data redaction, working days, hourly and cross-year charging, overlap rejection,
insufficient balances, duplicate approval and policy-change preservation. UI tests cover
role navigation and employee-code sign-in to the manager app. Real-company acceptance
of role assignments and actual leave policy remains necessary before broad rollout.
