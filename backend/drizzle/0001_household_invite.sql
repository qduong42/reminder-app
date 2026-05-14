CREATE TABLE IF NOT EXISTS "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "household_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"invited_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_members_household_user_unique" UNIQUE("household_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invite_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "invite_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "household_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'households_members_household_id_fk') THEN
    ALTER TABLE "household_members" ADD CONSTRAINT "households_members_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'household_members_user_id_fk') THEN
    ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'household_members_invited_by_id_fk') THEN
    ALTER TABLE "household_members" ADD CONSTRAINT "household_members_invited_by_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invite_tokens_household_id_fk') THEN
    ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invite_tokens_created_by_id_fk') THEN
    ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_created_by_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_household_id_households_id_fk') THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE set null;
  END IF;
END $$;
