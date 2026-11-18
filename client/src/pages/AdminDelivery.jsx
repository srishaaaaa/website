import AdminShell from '../components/AdminShell';
import DeliveryRulesCard from '../components/DeliveryRulesCard';

// Delivery: how the delivery charge is worked out at checkout (weight regions, distance bands, PIN zones, order tiers, free delivery).
export default function AdminDelivery() {
  return (
    <AdminShell title="Delivery" sub="Charges by product weight, region and distance. Applies to website orders.">
      <DeliveryRulesCard />
    </AdminShell>
  );
}
