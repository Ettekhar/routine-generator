# Helper: create folder if not exists
function MkDirSafe($path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path | Out-Null
    }
}

# Helper: create file if not exists
function MkFileSafe($path, $content = "") {
    if (-not (Test-Path $path)) {
        New-Item -ItemType File -Path $path -Value $content | Out-Null
    }
}

# ---- FOLDERS & FILES ----

# app root
MkDirSafe "app"
MkFileSafe "app\layout.tsx"
MkFileSafe "app\page.tsx"

# teachers
MkDirSafe "app\teachers"
MkFileSafe "app\teachers\page.tsx"
MkDirSafe "app\teachers\create"
MkFileSafe "app\teachers\create\page.tsx"
MkDirSafe "app\teachers\[id]"
MkFileSafe "app\teachers\[id]\page.tsx"
MkDirSafe "app\teachers\[id]\edit"
MkFileSafe "app\teachers\[id]\edit\page.tsx"

# courses
MkDirSafe "app\courses"
MkFileSafe "app\courses\page.tsx"
MkDirSafe "app\courses\create"
MkFileSafe "app\courses\create\page.tsx"
MkDirSafe "app\courses\[id]"
MkFileSafe "app\courses\[id]\page.tsx"
MkDirSafe "app\courses\[id]\edit"
MkFileSafe "app\courses\[id]\edit\page.tsx"

# batches
MkDirSafe "app\batches"
MkFileSafe "app\batches\page.tsx"
MkDirSafe "app\batches\create"
MkFileSafe "app\batches\create\page.tsx"
MkDirSafe "app\batches\[id]"
MkFileSafe "app\batches\[id]\page.tsx"
MkDirSafe "app\batches\[id]\edit"
MkFileSafe "app\batches\[id]\edit\page.tsx"

# batches -> groups
MkDirSafe "app\batches\[id]\groups"
MkDirSafe "app\batches\[id]\groups\create"
MkFileSafe "app\batches\[id]\groups\create\page.tsx"
MkDirSafe "app\batches\[id]\groups\[groupId]"
MkDirSafe "app\batches\[id]\groups\[groupId]\edit"
MkFileSafe "app\batches\[id]\groups\[groupId]\edit\page.tsx"

# batches -> courses
MkDirSafe "app\batches\[id]\courses"
MkDirSafe "app\batches\[id]\courses\assign"
MkFileSafe "app\batches\[id]\courses\assign\page.tsx"

# rooms
MkDirSafe "app\rooms"
MkFileSafe "app\rooms\page.tsx"
MkDirSafe "app\rooms\create"
MkFileSafe "app\rooms\create\page.tsx"
MkDirSafe "app\rooms\[id]"
MkDirSafe "app\rooms\[id]\edit"
MkFileSafe "app\rooms\[id]\edit\page.tsx"

# schedules
MkDirSafe "app\schedules"
MkFileSafe "app\schedules\page.tsx"
MkDirSafe "app\schedules\create"
MkFileSafe "app\schedules\create\page.tsx"
MkDirSafe "app\schedules\[id]"
MkDirSafe "app\schedules\[id]\edit"
MkFileSafe "app\schedules\[id]\edit\page.tsx"

# ----- API ROUTES -----
$apiRoutes = @(
    "teachers",
    "courses",
    "batches",
    "batch-groups",
    "rooms",
    "schedules",
    "batch-courses",
    "course-assignments"
)

MkDirSafe "api"

foreach ($route in $apiRoutes) {
    MkDirSafe "api\$route"
    MkFileSafe "api\$route\route.ts" "export function GET() {}"
    MkDirSafe "api\$route\[id]"
    MkFileSafe "api\$route\[id]\route.ts" "export function GET() {}"
}

Write-Host "All folders and files created successfully!" -ForegroundColor Green
