/* Built-in defaults: generic settings and the exercise library. Your own plan and logs come from your data repo or a backup. */
window.WL_DEFAULTS = {
 "config/config.json": {
  "athlete": {
   "name": "",
   "goalWeightLb": null,
   "weeklyLossTargetLb": [
    0.5,
    1.0
   ]
  },
  "progression": {
   "comment": "Applied after every finished session. Increments are lb; per-exercise increments in exercises.json win over these.",
   "upperIncrementLb": 5,
   "lowerIncrementLb": 10,
   "dumbbellIncrementLb": 5,
   "bodyweightRepStep": 1,
   "bodyweightRepCap": 12,
   "timedHoldStepSec": 5,
   "timedHoldCapSec": 90,
   "deloadPercent": 10,
   "missesBeforeDeload": 2,
   "roundToLb": 5,
   "planWeightIsFloor": true
  },
  "recovery": {
   "comment": "A signal is flagged when it falls this far from your own baseline.",
   "lowSleepPercentOfBaseline": 85,
   "lowHrvPercentOfBaseline": 85,
   "highRestingHrAboveAvgBpm": 5,
   "weightTrendDays": 28
  },
  "timer": {
   "beep": true,
   "vibrate": true
  },
  "tredict": {
   "enabled": true,
   "apiBase": "https://www.tredict.com/api/oauth/v2/",
   "writeSetsToNotes": true,
   "importWatchStats": true,
   "matchWindowHours": 3
  }
 },
 "config/exercises.json": {
  "Barbell Back Squat": {
   "form": "backsquat",
   "increment": 10,
   "alternates": [
    "Leg Press",
    "Front Squat"
   ],
   "cues": [
    "Bar sits on your upper traps, hands just outside your shoulders. Brace before you unrack.",
    "Sit down between your heels with knees tracking over your toes.",
    "Reach parallel (hip crease level with the knee), then drive up with chest and hips rising together."
   ],
   "avoid": "Hips shooting up first, which turns the squat into a good morning.",
   "video": "Barbell Back Squat proper form"
  },
  "Front Squat": {
   "form": "frontsquat",
   "increment": 10,
   "alternates": [
    "Barbell Back Squat",
    "Leg Press"
   ],
   "cues": [
    "Bar rests on the front of your shoulders. Elbows high, fingertips just keeping it in place.",
    "Stay tall: your torso is far more upright than in a back squat.",
    "Sit straight down and let your knees travel forward over your toes."
   ],
   "avoid": "Elbows dropping, which rolls the bar forward off your shoulders.",
   "video": "Front Squat proper form"
  },
  "Leg Press": {
   "form": "legpress",
   "increment": 10,
   "alternates": [
    "Barbell Back Squat",
    "Front Squat"
   ],
   "cues": [
    "Feet shoulder-width in the middle of the platform. Hips and lower back stay flat on the pad.",
    "Lower until your knees reach about 90°, or as deep as your hips stay down.",
    "Press through your whole foot and stop just short of locking the knees."
   ],
   "avoid": "Going so deep that your tailbone curls up off the seat.",
   "video": "Leg Press proper form"
  },
  "Romanian Deadlift": {
   "form": "rdl",
   "increment": 10,
   "alternates": [
    "Deadlift"
   ],
   "cues": [
    "Start standing with soft knees, and keep that same knee bend the whole rep.",
    "Push your hips straight back and let the bar slide down your thighs.",
    "Stop when your hamstrings are stretched (usually just below the knee), then drive your hips forward."
   ],
   "avoid": "Rounding your lower back to reach lower.",
   "video": "Romanian Deadlift proper form"
  },
  "Deadlift": {
   "form": "deadlift",
   "increment": 10,
   "alternates": [
    "Romanian Deadlift",
    "Trap Bar Deadlift"
   ],
   "cues": [
    "Bar over mid-foot with your shins touching it. Grip just outside your legs.",
    "Pull the slack out first: chest up, lats tight, hips set above the knees.",
    "Push the floor away. Keep the bar against your legs and finish tall with your glutes squeezed."
   ],
   "avoid": "Jerking the bar off the floor, or leaning back at the top.",
   "video": "Deadlift proper form"
  },
  "Trap Bar Deadlift": {
   "form": "trapbar",
   "increment": 10,
   "alternates": [],
   "cues": [
    "Stand centered in the bar with the handles in line with the middle of your feet.",
    "Hips sit lower and chest stays taller than in a straight-bar deadlift.",
    "Drive through the floor so your hips and shoulders rise together."
   ],
   "avoid": "Gripping off-center, which tips the bar forward or back.",
   "video": "Trap Bar Deadlift proper form"
  },
  "DB Bulgarian Split Squat": {
   "form": "bss",
   "increment": 5,
   "alternates": [
    "DB Step-Back Lunge"
   ],
   "cues": [
    "Rear laces on the bench. Set your front foot far enough out that the front shin stays fairly vertical.",
    "Drop straight down until your back knee nearly touches the floor.",
    "Push through your front heel. Finish all reps on one leg, then switch."
   ],
   "avoid": "Pushing off the back foot. It is only there for balance.",
   "video": "DB Bulgarian Split Squat proper form"
  },
  "DB Step-Back Lunge": {
   "form": "lunge",
   "increment": 5,
   "alternates": [
    "DB Bulgarian Split Squat"
   ],
   "cues": [
    "Stand tall with the dumbbells at your sides.",
    "Step back far enough that both knees bend to about 90°.",
    "Lightly touch the back knee down, then drive through the front foot to stand."
   ],
   "avoid": "Letting the front knee cave inward.",
   "video": "DB Step-Back Lunge proper form"
  },
  "Leg Curl": {
   "form": "legcurl",
   "increment": 10,
   "alternates": [],
   "cues": [
    "Knees just off the end of the pad, with the roller sitting just above your heels.",
    "Curl toward your glutes while keeping your hips pressed into the bench.",
    "Lower slowly, taking 2 to 3 seconds."
   ],
   "avoid": "Lifting your hips off the bench to swing the weight up.",
   "video": "Leg Curl proper form"
  },
  "Standing Calf Raise": {
   "form": "calf",
   "increment": 10,
   "alternates": [],
   "cues": [
    "Balls of your feet on the edge of the step, heels hanging off.",
    "Lower until you feel a full stretch and pause for a beat.",
    "Rise as high as you can and squeeze at the top."
   ],
   "avoid": "Bouncing out of the bottom.",
   "video": "Standing Calf Raise proper form"
  },
  "Plank": {
   "form": "plank",
   "increment": 5,
   "alternates": [],
   "cues": [
    "Elbows under your shoulders, forearms flat on the floor.",
    "Keep one straight line from head to heels. Squeeze your glutes and brace your core.",
    "Breathe slowly. Hold the position, not your breath."
   ],
   "avoid": "Hips sagging toward the floor or piking up.",
   "video": "Plank proper form"
  },
  "Barbell Bench Press": {
   "form": "bench",
   "increment": 5,
   "alternates": [
    "DB Bench Press"
   ],
   "cues": [
    "Eyes under the bar, shoulder blades pinched down and back, feet planted.",
    "Lower under control to your lower chest with elbows about 45° from your body.",
    "Press up and slightly back so the bar finishes over your shoulders."
   ],
   "avoid": "Bouncing the bar off your chest or flaring your elbows straight out.",
   "video": "Barbell Bench Press proper form"
  },
  "DB Bench Press": {
   "form": "dbbench",
   "increment": 5,
   "alternates": [
    "Barbell Bench Press"
   ],
   "cues": [
    "Kick the dumbbells up off your knees as you lie back.",
    "Lower to chest level with elbows about 45° from your body.",
    "Press up and slightly in without clanking the dumbbells together."
   ],
   "avoid": "Dropping the dumbbells far below chest level.",
   "video": "DB Bench Press proper form"
  },
  "Barbell Row": {
   "form": "row",
   "increment": 5,
   "alternates": [],
   "cues": [
    "Hinge to roughly 45° with soft knees and a flat back. The bar hangs under your shoulders.",
    "Pull the bar to your lower ribs by driving your elbows back.",
    "Lower under control without standing up between reps."
   ],
   "avoid": "Heaving the weight with your hips and lower back.",
   "video": "Barbell Row proper form"
  },
  "DB Shoulder Press": {
   "form": "ohp",
   "increment": 5,
   "alternates": [],
   "cues": [
    "Dumbbells at shoulder height, ribs down, glutes tight.",
    "Press straight overhead until your arms lock out, biceps by your ears.",
    "Lower back to shoulder height under control."
   ],
   "avoid": "Leaning back and arching your lower back to finish the rep.",
   "video": "DB Shoulder Press proper form"
  },
  "Lat Pulldown": {
   "form": "pulldown",
   "increment": 5,
   "alternates": [
    "Pull-Up"
   ],
   "cues": [
    "Lock your thighs under the pad and grip a bit wider than your shoulders.",
    "Lean back slightly and pull the bar to your upper chest, elbows down and back.",
    "Let it rise slowly until your arms are straight."
   ],
   "avoid": "Yanking with your whole body, or pulling the bar behind your neck.",
   "video": "Lat Pulldown proper form"
  },
  "DB Biceps Curl": {
   "form": "curl",
   "increment": 5,
   "alternates": [],
   "cues": [
    "Stand tall with your elbows pinned at your sides.",
    "Curl up while turning your palms to face the ceiling.",
    "Lower all the way down, slowly."
   ],
   "avoid": "Swinging your torso to get the weight up.",
   "video": "DB Biceps Curl proper form"
  },
  "Rope Pressdown": {
   "form": "pressdown",
   "increment": 5,
   "alternates": [],
   "cues": [
    "Elbows pinned at your sides with a slight forward lean.",
    "Push down and pull the rope ends apart at the bottom.",
    "Come back up until your forearms are about parallel to the floor."
   ],
   "avoid": "Letting your elbows drift forward and up.",
   "video": "Rope Pressdown proper form"
  },
  "Pull-Up": {
   "form": "pullup",
   "increment": 5,
   "alternates": [
    "Lat Pulldown"
   ],
   "cues": [
    "Start from a dead hang with your shoulders pulled down away from your ears.",
    "Pull your chest toward the bar until your chin clears it.",
    "Lower all the way to a full hang every rep."
   ],
   "avoid": "Kipping or cutting reps short.",
   "video": "Pull-Up proper form"
  },
  "Farmer's Walk": {
   "form": "farmer",
   "increment": 5,
   "alternates": [],
   "cues": [
    "Pick the dumbbells up with a flat back, like a deadlift.",
    "Stand tall with shoulders down and back, and brace your core.",
    "Walk with short, quick, controlled steps for the full time."
   ],
   "avoid": "Letting the weights pull your shoulders forward.",
   "video": "Farmer's Walk proper form"
  }
 }
};
