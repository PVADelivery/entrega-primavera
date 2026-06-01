export type DeliveryStatus = "pending" | "broadcasted" | "accepted" | "collecting" | "in_transit" | "delivered" | "cancelled" | "returned";

export type OccurrenceType = "motorcycle_issue" | "accident" | "robbery" | "delay" | "damage" | "absence" | "other";

export type UserRole = "admin" | "company" | "driver" | "customer";

export interface Company {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  latitude?: number | null;
  longitude?: number | null;
  active: boolean;
  document: string | null;
  email: string | null;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

export interface DeliveryDriver {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  document: string | null;
  vehicle_type: string;
  vehicle_plate: string | null;
  online: boolean;
  rating: number;
  total_deliveries: number;
  current_latitude: number | null;
  current_longitude: number | null;
  avatar_url: string | null;
  status: "pending" | "active" | "rejected" | "suspended";
}

export interface Delivery {
  id: string;
  company_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  pickup_address: string;
  dropoff_address: string;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  status: DeliveryStatus;
  price: number | null;
  distance_km: number | null;
  estimated_time_minutes: number | null;
  notes: string | null;
  proof_photo_url: string | null;
  signature_url: string | null;
  accepted_at: string | null;
  collected_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  company_id: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "preparing" | "ready" | "delivered" | "cancelled";
  created_at: string;
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

export interface Review {
  id: string;
  delivery_id: string;
  driver_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}

export interface Occurrence {
  id: string;
  driver_id: string;
  delivery_id: string;
  type: OccurrenceType;
  description: string;
  photo_url: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}
