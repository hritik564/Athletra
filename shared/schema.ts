import { sql } from "drizzle-orm";
import { pgTable, text, varchar, doublePrecision, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),

  height_cm: doublePrecision("height_cm"),
  weight_kg: doublePrecision("weight_kg"),
  primary_sport: text("primary_sport"),
  lead_hand: text("lead_hand").default("right"),
  skill_level: text("skill_level"),
  health_flags: text("health_flags").array(),
  fitness_goal: text("fitness_goal"),

  sport_specific_data: jsonb("sport_specific_data"),
  unlocked_sports: text("unlocked_sports").array(),
  preferred_unit_system: text("preferred_unit_system").default("metric"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
