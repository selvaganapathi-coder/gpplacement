# Permission Matrix

Permissions are **explicit codes** enforced by the API (`requirePermission`), not only by role checks or UI hiding.

Source of truth: `backend/server/permissions.ts` (`PERMISSION_MATRIX`, `DEFAULT_ROLE_PERMISSIONS`).

## Admin

```
Users
├── USER_CREATE
├── USER_READ
├── USER_UPDATE
└── USER_DELETE

Classes
├── CLASS_CREATE
├── CLASS_ASSIGN
└── CLASS_UPDATE

Tests
├── ASSESSMENT_CREATE
├── ASSESSMENT_EDIT
├── ASSESSMENT_DELETE
├── ASSESSMENT_PUBLISH
└── RESULT_VIEW

Audit Logs
└── AUDIT_LOG_VIEW
```

## Staff

```
Tests
├── ASSESSMENT_VIEW          (assigned / managed cohorts only)
├── ASSESSMENT_EDIT          (permitted tests only)
├── ASSESSMENT_PUBLISH
└── RESULT_VIEW

Students
└── STUDENT_VIEW             (assigned students / scopes only)

Results
├── RESULT_VIEW
├── RESULT_RELEASE
└── RESULT_EXPORT
```

Object-level rules (cohort, ownership) still apply after the permission check.

## Student

```
Tests
├── TEST_VIEW_ELIGIBLE
├── TEST_START
├── TEST_ANSWER
└── TEST_SUBMIT

Results
└── RESULT_VIEW_OWN          (own released results only)

Profile
├── PROFILE_READ_OWN
└── PROFILE_UPDATE_OWN
```

## Test security (answer keys)

Student exam session (`GET /api/student/tests/:testId/session`) returns only:

```json
{
  "id": "...",
  "prompt": "...",
  "options": [{ "id": "...", "text": "..." }]
}
```

Never `isCorrect`, `correctIndex`, or explanations during an in-progress attempt. Correctness stays server-side for scoring.
