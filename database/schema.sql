CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('farmer', 'staff', 'admin');
CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE bill_status AS ENUM ('unpaid', 'paid', 'overdue');
CREATE TYPE notification_status AS ENUM ('unread', 'read');

CREATE TABLE staff_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(180) NOT NULL,
  phone VARCHAR(50),
  role user_role NOT NULL DEFAULT 'farmer',
  staff_role_id UUID REFERENCES staff_roles(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE farmers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  national_id VARCHAR(80) NOT NULL UNIQUE,
  association_number VARCHAR(80) NOT NULL UNIQUE,
  region VARCHAR(160) NOT NULL,
  address TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  area_hectares NUMERIC(10, 2) NOT NULL CHECK (area_hectares >= 0),
  crop_type VARCHAR(120) NOT NULL,
  location VARCHAR(220) NOT NULL,
  soil_type VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE water_meters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  field_id UUID NOT NULL UNIQUE REFERENCES fields(id) ON DELETE CASCADE,
  meter_number VARCHAR(120) NOT NULL UNIQUE,
  installation_date DATE NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE meter_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meter_id UUID NOT NULL REFERENCES water_meters(id) ON DELETE CASCADE,
  reading_value NUMERIC(14, 2) NOT NULL CHECK (reading_value >= 0),
  consumption NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (consumption >= 0),
  reading_date DATE NOT NULL,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meter_readings_meter_date ON meter_readings(meter_id, reading_date DESC);

CREATE TABLE irrigation_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  field_id UUID REFERENCES fields(id) ON DELETE SET NULL,
  requested_date DATE NOT NULL,
  requested_hours NUMERIC(8, 2) NOT NULL CHECK (requested_hours > 0),
  water_amount NUMERIC(14, 2) CHECK (water_amount >= 0),
  reason TEXT,
  status request_status NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  staff_note TEXT,
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  meter_id UUID REFERENCES water_meters(id) ON DELETE SET NULL,
  reading_id UUID REFERENCES meter_readings(id) ON DELETE SET NULL,
  bill_number VARCHAR(120) NOT NULL UNIQUE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  consumption NUMERIC(14, 2) NOT NULL CHECK (consumption >= 0),
  rate NUMERIC(10, 3) NOT NULL CHECK (rate >= 0),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  status bill_status NOT NULL DEFAULT 'unpaid',
  due_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  method VARCHAR(80) NOT NULL,
  reference VARCHAR(160),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES users(id)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  status notification_status NOT NULL DEFAULT 'unread',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES users(id),
  action VARCHAR(160) NOT NULL,
  entity_type VARCHAR(120) NOT NULL,
  entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_bills_farmer_status ON bills(farmer_id, status);
CREATE INDEX idx_irrigation_requests_status ON irrigation_requests(status);
